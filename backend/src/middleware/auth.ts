import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/http.js";
import { verifyToken } from "../lib/token.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/** Require a valid Bearer token; attaches req.userId. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw ApiError.unauthorized("Missing Bearer token");
  }
  try {
    const payload = verifyToken(header.slice("Bearer ".length).trim());
    req.userId = payload.sub;
    next();
  } catch {
    throw ApiError.unauthorized("Invalid or expired token");
  }
}

/** Convenience for handlers: get the authenticated user id or throw. */
export function userIdOf(req: Request): string {
  if (!req.userId) throw ApiError.unauthorized();
  return req.userId;
}
