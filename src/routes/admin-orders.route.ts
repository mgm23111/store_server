// src/routes/admin-orders.route.ts
import { Router } from "express";
import { ah } from "../middlewares/asyncHandler";
import { authMiddleware, type AuthedRequest } from "../middlewares/auth";
import { adminOnly } from "../middlewares/admin";
import { adminDb } from "../infra/firebase";
import { approveYapeOrder, rejectYapeOrder } from "../domain/orders";
import { FieldValue } from "firebase-admin/firestore";

const router = Router();

// listar admin
router.get(
  "/admin/orders",
  authMiddleware,
  adminOnly,
  ah(async (req, res) => {
    const { status = "", provider = "", limit = "100" } = req.query as any;
    const lim = Math.min(200, Math.max(1, parseInt(limit || "100", 10) || 100));

    let q: FirebaseFirestore.Query = adminDb.collection("orders");
    if (provider) q = q.where("provider", "==", String(provider));
    if (status) q = q.where("status", "==", String(status));

    try {
      const snap = await q.orderBy("createdAt", "desc").limit(lim).get();
      return res.json(snap.docs.map(toOrderJson));
    } catch (e: any) {
      const snap = await q.limit(lim).get();
      const items = snap.docs.map(toOrderJson);
      items.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
      return res.json(items);
    }
  })
);

// verificar yape
router.post(
  "/orders/:id/verify-yape",
  authMiddleware,
  adminOnly,
  ah(async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const { action, note } = (req.body ?? {}) as { action?: "approve" | "reject"; note?: string };
    if (!action || !["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "action debe ser 'approve' o 'reject'" });
    }

    if (action === "approve") {
      await approveYapeOrder(id);
    } else {
      await rejectYapeOrder(id);
    }

    // nota opcional
    await adminDb.collection("orders").doc(id).set(
      {
        verificationNote: note || null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    res.json({ ok: true, id, status: action === "approve" ? "paid" : "cancelled" });
  })
);

// update shipping
router.post(
  "/admin/orders/:id/shipping",
  authMiddleware,
  adminOnly,
  ah(async (req, res) => {
    const { id } = req.params;
    const { status, carrier, tracking, address } = req.body ?? {};
    const allowed = ["none", "preparing", "shipped", "delivered", "cancelled"];
    if (!allowed.includes(status)) return res.status(400).json({ error: "shipping.status inválido" });

    await adminDb
      .collection("orders")
      .doc(id)
      .set(
        {
          shipping: {
            status,
            carrier: carrier ?? null,
            tracking: tracking ?? null,
            address: address ?? null,
            updatedAt: FieldValue.serverTimestamp(),
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    res.json({ ok: true });
  })
);

function toOrderJson(d: FirebaseFirestore.DocumentSnapshot) {
  const data: any = d.data() || {};
  const createdAt =
    data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt ?? new Date().toISOString();
  return {
    id: d.id,
    userId: data.userId ?? null,
    email: data.email ?? null,
    items: data.items ?? [],
    amount: data.amount ?? 0,
    currency: data.currency ?? "PEN",
    provider: data.provider ?? "culqi",
    status: data.status ?? "paid",
    createdAt,
    shipping: {
      status: data.shipping?.status ?? "none",
      carrier: data.shipping?.carrier ?? null,
      tracking: data.shipping?.tracking ?? null,
      address: data.shipping?.address ?? null,
    },
  };
}

export default router;
