import { resolveEntitlements, featureByKey } from "@budgetsmart/shared";
import type { NextFunction, Request, Response } from "express";
import { users } from "../db/repo.js";
import { ApiError } from "../lib/http.js";
import { userIdOf } from "./auth.js";

/**
 * Gate a router/route behind a plan feature. Must run AFTER `requireAuth`
 * (it reads req.userId). Returns 403 with the required tier when the caller's
 * plan doesn't grant the feature, so the frontend can prompt an upgrade.
 */
export function requireFeature(featureKey: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = users.findById(userIdOf(req));
    if (!user) throw ApiError.unauthorized();
    const ent = resolveEntitlements(user.tier);
    if (!ent.features.includes(featureKey)) {
      const feature = featureByKey(featureKey);
      throw new ApiError(
        403,
        `Your ${ent.tier.name} plan doesn't include ${feature?.label ?? featureKey}. Upgrade to unlock it.`,
        { code: "feature_locked", feature: featureKey, requiredLevel: feature?.level ?? null },
      );
    }
    next();
  };
}
