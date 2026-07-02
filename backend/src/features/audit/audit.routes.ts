import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { auditLog } from "../../db/repo.js";
import { asyncHandler } from "../../lib/http.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Records every successful mutating /api call for the authenticated user.
 * Only method + path + status are stored — request bodies never are, so the
 * log can't leak amounts, notes, or credentials.
 */
export function auditTrailMiddleware(req: Request, res: Response, next: NextFunction): void {
  // capture now — Express rewrites req.path during routing
  const fullPath = (req.originalUrl ?? req.path).split("?")[0]!;
  if (MUTATING.has(req.method) && fullPath.startsWith("/api")) {
    res.on("finish", () => {
      const userId = (req as Request & { userId?: string }).userId;
      if (!userId || res.statusCode >= 400) return;
      try {
        auditLog.add(userId, req.method, fullPath, res.statusCode);
      } catch {
        /* the audit trail must never break the request */
      }
    });
  }
  next();
}

export const auditRouter = Router();
auditRouter.use(requireAuth);

/** GET /audit → the newest audit entries (up to 200). */
auditRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    res.json({ entries: auditLog.list(userIdOf(req), limit) });
  }),
);
