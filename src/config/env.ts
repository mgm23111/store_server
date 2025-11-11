// src/config/env.ts
import * as dotenv from "dotenv";
import path from "path";

// carga el .env que está en la raíz del proyecto (donde haces `npm run dev`)
dotenv.config({ path: path.join(process.cwd(), ".env") });

function req(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`❌ Falta variable: ${name}`);
    process.exit(1);
  }
  return v;
}

export const env = {
  PORT: Number(process.env.PORT || 4242),
  CULQI_SECRET_KEY: req("CULQI_SECRET_KEY"),
  CORS_ORIGIN: (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  FIREBASE_SA_BASE64: process.env.FIREBASE_SA_BASE64,
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  YAPE_PHONE: process.env.YAPE_PHONE || "",
  YAPE_HOLDER: process.env.YAPE_HOLDER || "M2L Consulting",
  YAPE_MAX_TOTAL_S: Number(process.env.YAPE_MAX_TOTAL_S ?? 500),
};
