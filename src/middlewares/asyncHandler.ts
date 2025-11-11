// src/middlewares/asyncHandler.ts
import type { Request, Response, NextFunction } from "express";

export const ah =
  <T extends Request, U extends Response>(fn: (req: T, res: U, next: NextFunction) => any) =>
  (req: T, res: U, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);
