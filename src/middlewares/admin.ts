// src/middlewares/admin.ts
import type { Response, NextFunction } from "express";
import type { AuthedRequest } from "./auth";

export const adminOnly = (req: AuthedRequest, res: Response, next: NextFunction) => {
  if (!req.user?.isAdmin) return res.status(403).json({ error: "Forbidden" });
  next();
};
