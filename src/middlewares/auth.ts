// src/middlewares/auth.ts
import type { Request, Response, NextFunction } from "express";
import { authAdmin } from "../infra/firebase";

export type AuthedRequest = Request & {
  user?: { uid: string; email: string | null; isAdmin?: boolean; claims?: any };
};

export const authMiddleware = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const decoded = await authAdmin.verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      email: decoded.email ?? null,
      isAdmin: !!(decoded as any).admin,
      claims: decoded,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
};
