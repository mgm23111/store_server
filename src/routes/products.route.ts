// src/routes/products.route.ts
import { Router } from "express";
import { adminDb } from "../infra/firebase";
import { ah } from "../middlewares/asyncHandler";

const router = Router();

router.get(
  "/products",
  ah(async (req, res) => {
    const { active, oferta, offer, limit } = req.query as any;
    const parseBool = (v?: string) =>
      v === undefined ? undefined : ["1", "true", "yes"].includes(String(v).toLowerCase());
    const activeBool = parseBool(active);
    const offerParam = oferta ?? offer;
    const offerBool = parseBool(offerParam);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit ?? "50", 10) || 50));

    let q: FirebaseFirestore.Query = adminDb.collection("products");
    if (activeBool !== undefined) q = q.where("active", "==", activeBool);
    if (offerBool !== undefined) q = q.where("offer", "==", offerBool);

    const hasFilters = activeBool !== undefined || offerBool !== undefined;
    if (!hasFilters) q = q.orderBy("name");
    q = q.limit(limitNum);

    const snap = await q.get();
    let items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    if (hasFilters) {
      items.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
    }
    res.json(items);
  })
);

export default router;
