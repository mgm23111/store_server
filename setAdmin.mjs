import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import fs from "fs";

const serviceAccount = JSON.parse(fs.readFileSync("./service-account.json", "utf8"));

initializeApp({ credential: cert(serviceAccount) });

const uid = "5qkKnntgLJTVjjntQRywVRe1elz2";
const claims = { admin: true, roles: ["admin"] };

getAuth().setCustomUserClaims(uid, claims).then(() => {
  console.log("✅ Claims asignados al usuario:", uid, claims);
  process.exit(0);
}).catch(err => {
  console.error("❌ Error:", err);
  process.exit(1);
});
