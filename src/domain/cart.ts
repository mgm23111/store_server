// src/domain/cart.ts
import { adminDb } from "../infra/firebase";
import { FieldPath } from "firebase-admin/firestore";
import { HttpError } from "../utils/httpError";

type CartItemIn = { id: string; quantity: number };

const looksLikeDocId = (s: string) => /[A-Za-z]/.test(s) || s.length >= 16;

function normalizeCartItems(input: unknown): CartItemIn[] {
  if (!Array.isArray(input)) throw new HttpError(400, "items debe ser un array");
  const out: CartItemIn[] = [];
  input.forEach((raw, i) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const id = String(r.id ?? "").trim();
    const qn = Number(r.quantity ?? 1);
    const quantity = Number.isFinite(qn) && qn > 0 ? Math.floor(qn) : 0;
    if (!id) throw new HttpError(400, `items[${i}].id vacío`);
    if (quantity <= 0) throw new HttpError(400, `items[${i}].quantity inválido`);
    out.push({ id, quantity });
  });
  return out;
}

function readPrice(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function resolveCart(
  itemsIn: unknown,
  opts: { requireActiveForCharge?: boolean } = {}
) {
  const { requireActiveForCharge = true } = opts;
  const items = normalizeCartItems(itemsIn);
  if (items.length === 0) {
    return { amountCents: 0, normalizedItems: [], missing: [], inactive: [] };
  }

  // consolidar
  const qtyByKey = new Map<string, number>();
  for (const it of items) qtyByKey.set(it.id, (qtyByKey.get(it.id) ?? 0) + it.quantity);

  const keys = [...qtyByKey.keys()];
  const docIds = keys.filter(looksLikeDocId);
  const codeKeys = keys.filter((k) => !looksLikeDocId(k));

  type Row = {
    productId: string;
    name: string;
    price: number;
    active: boolean;
    sku?: string | number;
    code?: string | number;
  };

  const byKey = new Map<string, Row>();

  // 1) por documentId
  for (let i = 0; i < docIds.length; i += 10) {
    const chunk = docIds.slice(i, i + 10);
    if (!chunk.length) continue;
    const snap = await adminDb.collection("products").where(FieldPath.documentId(), "in", chunk).get();
    snap.forEach((d) => {
      const x = d.data() ?? {};
      byKey.set(d.id, {
        productId: d.id,
        name: String((x as any).name ?? ""),
        price: readPrice((x as any).price),
        active: Boolean((x as any).active ?? true),
        sku: (x as any).sku,
        code: (x as any).id,
      });
    });
  }

  // helper
  async function fillByField(field: "sku" | "id", sourceKeys: string[]) {
    if (!sourceKeys.length) return;
    const numericKeys = sourceKeys.filter((k) => k !== "" && !isNaN(Number(k))).map((k) => Number(k));
    const stringKeys = sourceKeys.map((k) => String(k));

    const runChunks = async (vals: any[]) => {
      for (let i = 0; i < vals.length; i += 10) {
        const c = vals.slice(i, i + 10);
        if (!c.length) continue;
        const snap = await adminDb.collection("products").where(field, "in", c).get();
        snap.forEach((d) => {
          const x = d.data() ?? {};
          const value = (x as any)[field];
          const valueStr = String(value);
          const matchKey = sourceKeys.find(
            (k) => k === valueStr || String(Number(k)) === String(Number(value))
          );
          if (matchKey && !byKey.has(matchKey)) {
            byKey.set(matchKey, {
              productId: d.id,
              name: String((x as any).name ?? ""),
              price: readPrice((x as any).price),
              active: Boolean((x as any).active ?? true),
              sku: (x as any).sku,
              code: (x as any).id,
            });
          }
        });
      }
    };

    await runChunks(stringKeys);
    await runChunks(numericKeys);
  }

  await fillByField("sku", codeKeys);
  await fillByField("id", codeKeys);

  const missing: string[] = keys.filter((k) => !byKey.has(k));
  const inactive: string[] = [];
  let amount = 0;
  const normalized: Array<{ id: string; name: string; price: number; quantity: number }> = [];

  for (const [key, qty] of qtyByKey.entries()) {
    const row = byKey.get(key);
    if (!row) continue;
    if (requireActiveForCharge && !row.active) {
      inactive.push(key);
      continue;
    }
    amount += Number(row.price) * qty;
    normalized.push({
      id: row.productId,
      name: row.name,
      price: row.price,
      quantity: qty,
    });
  }

  const amountCents = Math.round(amount * 100);
  return { amountCents, normalizedItems: normalized, missing, inactive };
}
