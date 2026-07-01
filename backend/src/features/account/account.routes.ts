import { normalizeTierId, resolveEntitlements } from "@budgetsmart/shared";
import { Router } from "express";
import { z } from "zod";
import { centralLink, users } from "../../db/repo.js";
import { central } from "../../lib/central.js";
import { ApiError, asyncHandler } from "../../lib/http.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";

export const accountRouter = Router();
accountRouter.use(requireAuth);

/** Apply a central tier to this local user (drives feature gating). */
function applyTier(userId: string, tier: string) {
  users.setTier(userId, normalizeTierId(tier));
}

function linkState(userId: string) {
  const link = centralLink.get(userId);
  if (!link) return { linked: false as const };
  return {
    linked: true as const,
    email: link.email,
    tier: link.tier,
    status: link.status,
    syncedAt: link.syncedAt,
    entitlements: resolveEntitlements(link.tier),
  };
}

/** GET /account → whether this device is linked to a web account, and the synced tier. */
accountRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(linkState(userIdOf(req)));
  }),
);

const linkSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

/** POST /account/link → sign into the central account and adopt its tier. */
accountRouter.post(
  "/link",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { email, password } = linkSchema.parse(req.body);
    const result = await central.login(email, password);
    if (!result.ok) {
      throw new ApiError(result.status === 0 ? 502 : result.status, result.error, { code: result.code });
    }
    const { token, account } = result.data;
    centralLink.set({ userId, email: account.email, token, tier: account.tier, status: account.subscriptionStatus });
    applyTier(userId, account.tier);
    res.json(linkState(userId));
  }),
);

/** POST /account/sync → refresh the tier from the central account (called on reload). */
accountRouter.post(
  "/sync",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const link = centralLink.get(userId);
    if (!link) return res.json({ linked: false });

    const result = await central.entitlement(link.token);
    if (!result.ok) {
      // Token expired/invalid → drop the link so the user re-connects; keep offline access at base.
      if (result.status === 401) {
        centralLink.clear(userId);
        applyTier(userId, "base");
        return res.json({ linked: false, reauth: true });
      }
      // Network/transient error → keep the last-known tier, report it.
      return res.json({ ...linkState(userId), stale: true, error: result.error });
    }
    centralLink.set({ userId, email: link.email, token: link.token, tier: result.data.tier, status: result.data.subscriptionStatus });
    applyTier(userId, result.data.tier);
    res.json(linkState(userId));
  }),
);

/** POST /account/unlink → disconnect this device; entitlement falls back to base. */
accountRouter.post(
  "/unlink",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    centralLink.clear(userId);
    applyTier(userId, "base");
    res.json({ linked: false });
  }),
);
