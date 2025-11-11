// src/domain/orders.ts
import { adminDb } from "../infra/firebase";
import { FieldValue } from "firebase-admin/firestore";
import { env } from "../config/env";
import { resolveCart } from "./cart";
import { HttpError } from "../utils/httpError";

export async function createYapeOrder(uid: string, email: string | null, body: any) {
  const { items, amount, currency_code = "PEN" } = body as {
    items: any[];
    amount?: number;
    currency_code?: string;
  };

  const { amountCents, normalizedItems, missing, inactive } = await resolveCart(items, {
    requireActiveForCharge: true,
  });

  if (missing.length || inactive.length) {
    throw new HttpError(400, "Algunos productos ya no están disponibles", "PRODUCT_NOT_FOUND", {
      missing,
      inactive,
    });
  }
  if (amountCents <= 0) throw new HttpError(400, "Monto inválido");

  // límite
  const maxCents = Math.round(env.YAPE_MAX_TOTAL_S * 100);
  if (amountCents > maxCents) {
    throw new HttpError(400, `Para montos mayores a S/ ${env.YAPE_MAX_TOTAL_S} usa Culqi.`, "YAPE_LIMIT");
  }

  // validación contra front
  const clientAmount = Number(amount ?? 0);
  if (clientAmount && clientAmount !== amountCents) {
    throw new HttpError(409, "El total cambió mientras procesabas el pago.", "AMOUNT_MISMATCH", {
      expected: amountCents,
      received: clientAmount,
    });
  }

  const ref = adminDb.collection("orders").doc();
  await ref.set({
    userId: uid,
    email: email || "cliente@test.com",
    items: normalizedItems,
    amount: amountCents,
    currency: currency_code,
    status: "pending",
    provider: "yape",
    shipping: {
      status: "none",
      carrier: null,
      tracking: null,
      address: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: ref.id, amountCents };
}

export async function approveYapeOrder(orderId: string) {
  await adminDb.runTransaction(async (tx) => {
    const ref = adminDb.collection("orders").doc(orderId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpError(404, "Not found");
    const data = snap.data()!;
    if (data.provider !== "yape") throw new HttpError(400, "La orden no es de tipo Yape");
    if (data.status === "paid") return; // idempotencia

    // validar stock
    for (const it of data.items ?? []) {
      const pRef = adminDb.collection("products").doc(it.id || it.productId);
      const pSnap = await tx.get(pRef);
      if (!pSnap.exists) throw new HttpError(400, `Producto ${it.name} no existe`);
      const stock = pSnap.data()?.stock ?? 0;
      const qty = Number(it.quantity ?? 1);
      if (stock < qty) throw new HttpError(400, `Sin stock de ${it.name}`);
    }

    // descontar
    for (const it of data.items ?? []) {
      const pRef = adminDb.collection("products").doc(it.id || it.productId);
      const qty = Number(it.quantity ?? 1);
      tx.update(pRef, { stock: FieldValue.increment(-qty) });
    }

    tx.update(ref, {
      status: "paid",
      payment: { status: "paid", method: "yape" },
      verifiedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function rejectYapeOrder(orderId: string) {
  await adminDb.collection("orders").doc(orderId).update({
    status: "cancelled",
    payment: { status: "rejected", method: "yape" },
    cancelledAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
