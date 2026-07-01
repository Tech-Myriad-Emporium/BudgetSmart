import { FEATURES, TIERS, resolveEntitlements } from "@budgetsmart/shared";
import { Router } from "express";
import { users } from "../../db/repo.js";
import { effectiveTier } from "../../lib/entitlement.js";
import { ApiError, asyncHandler } from "../../lib/http.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";

export const subscriptionRouter = Router();
subscriptionRouter.use(requireAuth);

/** GET /subscription/plans → the full tier + feature catalog for the pricing page. */
subscriptionRouter.get(
  "/plans",
  asyncHandler(async (_req, res) => {
    res.json({ tiers: TIERS, features: FEATURES });
  }),
);

/** GET /subscription → the tier this device is entitled to (verified) + entitlements. */
subscriptionRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    if (!users.findById(userId)) throw ApiError.unauthorized();
    const tierId = effectiveTier(userId);
    res.json({ tierId, entitlements: resolveEntitlements(tierId) });
  }),
);

/**
 * PUT /subscription → no longer switches plans locally. The tier is proven by a
 * signed token from the central account, so plan changes happen on the web.
 */
subscriptionRouter.put(
  "/",
  asyncHandler(async (_req, _res) => {
    throw new ApiError(403, "Plans are managed on budgetsmarttme.com — buy or change your plan there, then reload.", {
      code: "managed_on_web",
    });
  }),
);
