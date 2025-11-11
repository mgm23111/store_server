// src/routes/health.route.ts
import { Router } from "express";
import { env } from "../config/env";

const router = Router();

router.get("/health", (req, res) => {
  const k = env.CULQI_SECRET_KEY;
  res.json({
    culqiKeyLoaded: !!k,
    env: k.startsWith("sk_test_") ? "test" : k.startsWith("sk_live_") ? "live" : "unknown",
    prefix: k.slice(0, 8),
  });
});

export default router;
