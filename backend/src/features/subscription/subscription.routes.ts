import { FEATURES, TIERS, resolveEntitlements } from "@budgetsmart/shared";
import { Router } from "express";
import { z } from "zod";
import { users } from "../../db/repo.js";
import { ApiError, asyncHandler } from "../../lib/http.js";
import { serializeUser } from "../../lib/serialize.js";
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

/** GET /subscription → the user's current tier + resolved entitlements. */
subscriptionRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = users.findById(userIdOf(req));
    if (!user) throw ApiError.unauthorized();
    res.json({ tierId: user.tier, entitlements: resolveEntitlements(user.tier) });
  }),
);

const changeSchema = z.object({ tierId: z.string().min(1) });

/** PUT /subscription → switch plan (no real billing in this slice). */
subscriptionRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { tierId } = changeSchema.parse(req.body);
    if (!TIERS.some((t) => t.id === tierId)) throw ApiError.badRequest("Unknown plan");
    const user = users.setTier(userId, tierId);
    res.json({ tierId: user.tier, entitlements: resolveEntitlements(user.tier), user: serializeUser(user) });
  }),
);
