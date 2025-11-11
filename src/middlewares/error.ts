// src/middlewares/error.ts
import type { Request, Response, NextFunction } from "express";
import { HttpError } from "../utils/httpError";

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error("Unhandled:", err?.stack || err);
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code, info: err.info });
  }
  const status = typeof err?.status === "number" ? err.status : 500;
  res.status(status).json({ error: err?.message || "Internal error" });
}
