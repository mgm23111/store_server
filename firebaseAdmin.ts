// server/firebaseAdmin.ts
import fs from "fs";
import path from "path";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// 1) Preferencia: FIREBASE_SA_BASE64 (si existe), 2) archivo en ruta, 3) GOOGLE_APPLICATION_CREDENTIALS
function loadServiceAccount(): any | null {
  // A) base64 en .env (opcional)
  const b64 = process.env.FIREBASE_SA_BASE64;
  if (b64) {
    try { return JSON.parse(Buffer.from(b64, "base64").toString("utf8")); } catch {}
  }

  // B) Archivo local (recomendado)
  const defaultPath = path.join(process.cwd(), "server", "service-account.json");
  const filePath = process.env.GOOGLE_APPLICATION_CREDENTIALS || defaultPath;
  try {
    const json = fs.readFileSync(filePath, "utf8");
    return JSON.parse(json);
  } catch (e: any) {
    console.error("❌ No pude leer credenciales en:", filePath, "-", e.message);
    return null;
  }
}

const sa = loadServiceAccount();
if (!getApps().length) {
  if (!sa) {
    throw new Error("No hay credenciales para Firebase Admin. Coloca server/service-account.json o define FIREBASE_SA_BASE64/GOOGLE_APPLICATION_CREDENTIALS.");
  }
  initializeApp({
    credential: cert(sa),
    projectId: sa.project_id, // asegura que coincide con el del front
  });
}

export const adminAuth = getAuth();
export const db = getFirestore();
export const AdminFieldValue = FieldValue;
