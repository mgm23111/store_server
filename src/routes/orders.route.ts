// src/routes/orders.route.ts
import { Router } from "express";
import { ah } from "../middlewares/asyncHandler";
import { authMiddleware, type AuthedRequest } from "../middlewares/auth";
import { adminDb } from "../infra/firebase";
import { FieldValue } from "firebase-admin/firestore";
import { resolveCart } from "../domain/cart";
import { chargeCulqi } from "../services/culqi.service";
const YAPE_PHONE = process.env.YAPE_PHONE || "";            // número al que se hace el Yape
const YAPE_HOLDER = process.env.YAPE_HOLDER || "M2L Store"; // nombre del titular
const YAPE_MAX_TOTAL_S = Number(process.env.YAPE_MAX_TOTAL_S ?? 500); // monto máximo S/
const YAPE_MAX_CENTS = Math.round(YAPE_MAX_TOTAL_S * 100);  // monto máximo en centavos
const router = Router();

// validar carrito
router.post(
  "/cart/validate",
  authMiddleware,
  ah(async (req: AuthedRequest, res) => {
    const { items } = (req.body ?? {}) as { items?: any[] };
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, user_message: "Carrito vacío" });
    }

    const { amountCents, normalizedItems, missing, inactive } = await resolveCart(items, {
      requireActiveForCharge: true,
    });

    if (missing.length || inactive.length) {
      return res.status(200).json({
        ok: false,
        user_message: "Hay productos que ya no están disponibles.",
        amountCents,
        normalizedItems,
        missing,
        inactive,
      });
    }

    return res.json({ ok: true, amountCents, normalizedItems });
  })
);

// cobro Culqi
router.post(
  "/culqi/charge",
  authMiddleware,
  ah(async (req: AuthedRequest, res) => {
    const { uid, email: authEmail } = req.user!;
    const { token, source_id, items, currency_code = "PEN", email, amount,  delivery } = req.body ?? {};

    const src = source_id || token;
    if (!src) return res.status(400).json({ status: "error", message: "Falta source_id/token" });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ status: "error", message: "Carrito vacío" });
    }

    const resolution = await resolveCart(items, { requireActiveForCharge: true });
    if (resolution.missing.length || resolution.inactive.length) {
      return res.status(400).json({
        status: "error",
        code: "PRODUCT_NOT_FOUND",
        user_message: "Algunos productos ya no están disponibles. Actualizamos tu carrito.",
        missing: resolution.missing,
        inactive: resolution.inactive,
      });
    }

    const { amountCents, normalizedItems } = resolution;
    if (amountCents <= 0) {
      return res.status(400).json({ status: "error", message: "Monto inválido" });
    }

    const clientAmount = Number(amount ?? 0);
    if (clientAmount && clientAmount !== amountCents) {
      return res.status(409).json({
        status: "error",
        code: "AMOUNT_MISMATCH",
        user_message: "El total cambió mientras procesabas el pago. Refresca el carrito.",
        expected: amountCents,
        received: clientAmount,
      });
    }
const deliveryData = delivery ?? null;
const shippingAddress =
  deliveryData?.method === "delivery" ? deliveryData.address ?? null : null;
    // crea orden pending
    const orderRef = adminDb.collection("orders").doc();
    await orderRef.set({
      userId: uid,
      email: authEmail || email || "cliente@test.com",
      items: normalizedItems,
      amount: amountCents,
      currency: currency_code,
      status: "pending",
      provider: "culqi",
      delivery: deliveryData,
      shipping: {
          status: deliveryData?.method === "delivery" ? "preparing" : "none",
        carrier: null,
        tracking: null,
        address: shippingAddress,
        updatedAt: FieldValue.serverTimestamp(),
      },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // cobro
    const charge = await chargeCulqi({
      amount: amountCents,
      currency_code,
      email: authEmail || email || "cliente@test.com",
      source_id: src,
      description: `Pedido ${orderRef.id}`,
      orderId: orderRef.id,
    });

    if (!charge.ok) {
      await orderRef.update({
        status: "failed",
        updatedAt: FieldValue.serverTimestamp(),
        errorCode: charge.data?.code || null,
        errorMsg: charge.data?.user_message || charge.data?.merchant_message || "Error Culqi",
      });
      return res.status(400).json({
        status: "error",
        code: charge.data?.code,
        user_message: charge.data?.user_message,
        merchant_message: charge.data?.merchant_message,
        orderId: orderRef.id,
      });
    }

    // marcar pagado + descontar stock
    await adminDb.runTransaction(async (tx) => {
      const oRef = adminDb.collection("orders").doc(orderRef.id);
      const oSnap = await tx.get(oRef);
      const data = oSnap.data()!;
      // valida stock igual que Yape
      for (const it of data.items ?? []) {
        const pRef = adminDb.collection("products").doc(it.id || it.productId);
        const pSnap = await tx.get(pRef);
        if (!pSnap.exists) throw new Error(`Producto ${it.name} no existe`);
        const stock = pSnap.data()?.stock ?? 0;
        if (stock < it.quantity) throw new Error(`Sin stock de ${it.name}`);
      }
      for (const it of data.items ?? []) {
        const pRef = adminDb.collection("products").doc(it.id || it.productId);
        tx.update(pRef, { stock: FieldValue.increment(-it.quantity) });
      }
      tx.update(oRef, {
        status: "paid",
        updatedAt: FieldValue.serverTimestamp(),
        chargeId: charge.data.id,
      });
    });

    return res.json({ status: "ok", orderId: orderRef.id, chargeId: charge.data.id, amount: amountCents });
  })
);

// listar órdenes del usuario
router.get(
  "/orders",
  authMiddleware,
  ah(async (req: AuthedRequest, res) => {
    const uid = req.user!.uid;
    const statusParam = String((req.query.status ?? "") as string).trim();
    const statuses = statusParam ? statusParam.split(",").map((s) => s.trim()) : null;

    let q: FirebaseFirestore.Query = adminDb.collection("orders").where("userId", "==", uid);
    if (statuses && statuses.length === 1) {
      q = q.where("status", "==", statuses[0]);
    }
    q = q.orderBy("createdAt", "desc").limit(100);

    const snap = await q.get();
    let orders = snap.docs.map((d) => {
      const data = d.data() as any;
      const createdAt =
        data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt ?? new Date().toISOString();
      return {
        id: d.id,
        ...data,
        createdAt,
        shipping: {
          status: data.shipping?.status ?? "none",
          carrier: data.shipping?.carrier ?? null,
          tracking: data.shipping?.tracking ?? null,
          address: data.shipping?.address ?? null,
          updatedAt: data.shipping?.updatedAt ?? null,
        },
      };
    });

    if (statuses && statuses.length > 1) {
      const set = new Set(statuses);
      orders = orders.filter((o) => set.has(String(o.status)));
    }

    res.json(orders);
  })
);

// detalle
router.get(
  "/orders/:id",
  authMiddleware,
  ah(async (req: AuthedRequest, res) => {
    const snap = await adminDb.collection("orders").doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ error: "Not found" });
    const data = snap.data()!;
    if (data.userId !== req.user!.uid) return res.status(403).json({ error: "Forbidden" });
    res.json({ id: snap.id, ...data });
  })
);
// crear orden con pago Yape (pendiente de verificación)
 router.post(
  "/orders/yape",
  authMiddleware,
  ah(async (req: AuthedRequest, res) => {
    const { uid, email: authEmail } = req.user!;

    const {
      items,                   // [{id, quantity}]
      amount,                  // opcional (centavos)
      currency_code = "PEN",
      payerName,
      payerPhone,
      reference,
      proofUrl,
      delivery,                // 👈 VIENE DEL FRONT (useCheckout + buildCheckoutBody)
    } = (req.body ?? {}) as {
      items?: any[];
      amount?: number;
      currency_code?: string;
      payerName?: string;
      payerPhone?: string;
      reference?: string;
      proofUrl?: string;
      delivery?: {
        method: "pickup" | "delivery";
        address?: {
          fullName?: string;
          phone?: string;
          line1?: string;
          district?: string;
          notes?: string;
        } | null;
      } | null;
    };

    // 1) Validar carrito
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ status: "error", message: "Carrito vacío" });
    }

    // 2) Resolver ítems y precios oficiales
    const { amountCents, normalizedItems, missing, inactive } = await resolveCart(
      items,
      { requireActiveForCharge: true }
    );

    if (missing.length || inactive.length) {
      return res.status(400).json({
        status: "error",
        code: "PRODUCT_NOT_FOUND",
        user_message: "Algunos productos ya no están disponibles. Actualizamos tu carrito.",
        missing,
        inactive,
      });
    }

    if (amountCents <= 0) {
      return res.status(400).json({ status: "error", message: "Monto inválido" });
    }

    // 3) Límite Yape
    if (amountCents > YAPE_MAX_CENTS) {
      return res.status(400).json({
        status: "error",
        code: "YAPE_LIMIT_EXCEEDED",
        user_message: `Para montos mayores a S/ ${YAPE_MAX_TOTAL_S} usa tarjeta (Culqi).`,
        limitCents: YAPE_MAX_CENTS,
        amountCents,
      });
    }

    // 4) Validar monto que manda el front
    const clientAmount = Number(amount ?? 0);
    if (Number.isFinite(clientAmount) && clientAmount > 0 && clientAmount !== amountCents) {
      return res.status(409).json({
        status: "error",
        code: "AMOUNT_MISMATCH",
        user_message: "El total cambió mientras procesabas el pago. Refresca el carrito.",
        expected: amountCents,
        received: clientAmount,
      });
    }

    // 👉 NUEVO: normalizar info de entrega
    const deliveryData = delivery ?? null;
    const shippingAddress =
      deliveryData?.method === "delivery" ? deliveryData.address ?? null : null;

    // 5) Crear orden "pending" con proveedor Yape
    const orderRef = adminDb.collection("orders").doc();
    await orderRef.set({
      userId: uid,
      email: authEmail || "cliente@test.com",
      items: normalizedItems,
      amount: amountCents,
      currency: currency_code,
      status: "pending",
      provider: "yape",

      // 👉 Guardamos el bloque completo de entrega
      delivery: deliveryData,

      yape: {
        payerName: payerName || null,
        payerPhone: payerPhone || null,
        reference: reference || null,
        proofUrl: proofUrl || null,
        targetPhone: YAPE_PHONE || null,
        targetHolder: YAPE_HOLDER || null,
      },

      // 👉 shipping con dirección real cuando es envío
      shipping: {
        status: deliveryData?.method === "delivery" ? "preparing" : "none",
        carrier: null,
        tracking: null,
        address: shippingAddress,
        updatedAt: FieldValue.serverTimestamp(),
      },

      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 6) Respuesta
    return res.status(201).json({
      status: "ok",
      orderId: orderRef.id,
      amount: amountCents,
      currency: currency_code,
      provider: "yape",
      paymentTarget: {
        phone: YAPE_PHONE,
        holder: YAPE_HOLDER,
        limitCents: YAPE_MAX_CENTS,
      },
      message:
        "Orden creada en estado pendiente. Realiza el pago Yape y espera la verificación.",
    });
  })
);



export default router;
