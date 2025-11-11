// src/infra/firebase.ts
import fs from "fs";
import path from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { env } from "../config/env";
export { adminAuth as authAdmin };

function loadServiceAccount() {
  // 1) si viene por env en base64
  if (env.FIREBASE_SA_BASE64) {
    return JSON.parse(
      Buffer.from(env.FIREBASE_SA_BASE64, "base64").toString("utf8")
    );
  }

  // 2) si te dieron un json en disco
  const defaultPath = path.resolve(process.cwd(), "service-account.json"); // 👈 sin "server/"
  const fileToRead = env.GOOGLE_APPLICATION_CREDENTIALS || defaultPath;

  if (!fs.existsSync(fileToRead)) {
    throw new Error(
      `No se encontró el service account en: ${fileToRead}. Pon el archivo ahí o usa FIREBASE_SA_BASE64`
    );
  }

  return JSON.parse(fs.readFileSync(fileToRead, "utf8"));
}

const sa = loadServiceAccount();

if (!getApps().length) {
  initializeApp({
    credential: cert(sa as any),
    projectId: sa.project_id || env.FIREBASE_PROJECT_ID,
  });
}

export const adminAuth = getAuth();
export const adminDb = getFirestore();
