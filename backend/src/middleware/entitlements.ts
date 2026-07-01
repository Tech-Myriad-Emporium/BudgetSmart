import { resolveEntitlements, featureByKey } from "@budgetsmart/shared";
import type { NextFunction, Request, Response } from "express";
import { users } from "../db/repo.js";
import { effectiveTier } from "../lib/entitlement.js";
import { ApiError } from "../lib/http.js";
import { userIdOf } from "./auth.js";

/**
 * Gate a router/route behind a plan feature. Must run AFTER `requireAuth`.
 * The tier comes from `effectiveTier` — a signature-verified entitlement token,
 * not a raw DB column — so premium can't be unlocked by editing local data.
 */
export function requireFeature(featureKey: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const userId = userIdOf(req);
    if (!users.findById(userId)) throw ApiError.unauthorized();
    const ent = resolveEntitlements(effectiveTier(userId));
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
