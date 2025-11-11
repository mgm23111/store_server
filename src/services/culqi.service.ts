// src/services/culqi.service.ts
import { env } from "../config/env";

export async function chargeCulqi(params: {
  amount: number;
  currency_code: string;
  email: string;
  source_id: string;
  description: string;
  orderId: string;
}) {
  const resp = await fetch("https://api.culqi.com/v2/charges", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.CULQI_SECRET_KEY}`,
      "X-Culqi-Environment": env.CULQI_SECRET_KEY.startsWith("sk_test_") ? "test" : "prod",
      "Idempotency-Key": `order_${params.orderId}`,
    },
    body: JSON.stringify(params),
  });
  const data = await resp.json();
  return { ok: resp.ok, data };
}
