import { normalizeTierId, resolveEntitlements } from "@budgetsmart/shared";
import { Router } from "express";
import { z } from "zod";
import { centralLink, users } from "../../db/repo.js";
import { central } from "../../lib/central.js";
import { effectiveTier } from "../../lib/entitlement.js";
import { ApiError, asyncHandler } from "../../lib/http.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";

export const accountRouter = Router();
accountRouter.use(requireAuth);

/** Cache the verified tier onto the local user row (display only — gating uses effectiveTier). */
function applyTier(userId: string) {
  users.setTier(userId, effectiveTier(userId));
}

function linkState(userId: string) {
  const link = centralLink.get(userId);
  if (!link) return { linked: false as const };
  const tier = effectiveTier(userId);
  return {
    linked: true as const,
    email: link.email,
    tier,
    status: link.status,
    syncedAt: link.syncedAt,
    entitlements: resolveEntitlements(tier),
  };
}

/** GET /account → whether this device is linked to a web account, and the entitled tier. */
accountRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(linkState(userIdOf(req)));
  }),
);

const linkSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

/** POST /account/link → sign into the central account and adopt its signed entitlement. */
accountRouter.post(
  "/link",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { email, password } = linkSchema.parse(req.body);
    const login = await central.login(email, password);
    if (!login.ok) throw new ApiError(login.status === 0 ? 502 : login.status, login.error, { code: login.code });

    const ent = await central.entitlement(login.data.token);
    if (!ent.ok) throw new ApiError(ent.status === 0 ? 502 : ent.status, ent.error);

    centralLink.set({
      userId,
      email: login.data.account.email,
      token: login.data.token,
      tier: normalizeTierId(ent.data.tier),
      status: ent.data.subscriptionStatus,
      centralUserId: login.data.account.id,
      entToken: ent.data.token,
    });
    applyTier(userId);
    res.json(linkState(userId));
  }),
);

/** POST /account/sync → refresh the signed entitlement from central (called on reload). */
accountRouter.post(
  "/sync",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const link = centralLink.get(userId);
    if (!link) return res.json({ linked: false });

    const result = await central.entitlement(link.token);
    if (!result.ok) {
      // Auth token expired/invalid → drop the link; the (now-stale) entitlement token
      // will still lock to base once it expires. Prompt re-connect.
      if (result.status === 401) {
        centralLink.clear(userId);
        applyTier(userId);
        return res.json({ linked: false, reauth: true });
      }
      // Offline / transient → keep the last signed token (valid until it expires).
      return res.json({ ...linkState(userId), stale: true, error: result.error });
    }
    centralLink.set({
      userId,
      email: link.email,
      token: link.token,
      tier: normalizeTierId(result.data.tier),
      status: result.data.subscriptionStatus,
      centralUserId: link.centralUserId,
      entToken: result.data.token,
    });
    applyTier(userId);
    res.json(linkState(userId));
  }),
);

/** POST /account/unlink → disconnect this device; entitlement falls back to base. */
accountRouter.post(
  "/unlink",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    centralLink.clear(userId);
    applyTier(userId);
    res.json({ linked: false });
  }),
);
