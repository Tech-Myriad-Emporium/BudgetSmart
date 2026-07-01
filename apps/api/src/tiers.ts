import type { Env } from "./types.js";

// Mirror of the tier ids in @budgetsmart/shared. The app resolves the actual
// feature set from the tier id locally; the central API only needs to know the
// valid tiers and how they map to Stripe prices.
export const SUBSCRIPTION_TIERS = ["ind_t1", "ind_t2", "ind_t3", "fam_t1", "fam_t2", "fam_t3"] as const;
export const ALL_TIERS = ["base", ...SUBSCRIPTION_TIERS] as const;
export type TierId = (typeof ALL_TIERS)[number];

export const isValidTier = (t: string): t is TierId => (ALL_TIERS as readonly string[]).includes(t);
export const isSubscriptionTier = (t: string): boolean => (SUBSCRIPTION_TIERS as readonly string[]).includes(t);

/** Base is a one-time purchase; the rest are recurring subscriptions. */
export const checkoutMode = (tier: string): "payment" | "subscription" =>
  tier === "base" ? "payment" : "subscription";

function priceMap(env: Env): Record<string, string | undefined> {
  return {
    base: env.STRIPE_PRICE_BASE,
    ind_t1: env.STRIPE_PRICE_IND_T1,
    ind_t2: env.STRIPE_PRICE_IND_T2,
    ind_t3: env.STRIPE_PRICE_IND_T3,
    fam_t1: env.STRIPE_PRICE_FAM_T1,
    fam_t2: env.STRIPE_PRICE_FAM_T2,
    fam_t3: env.STRIPE_PRICE_FAM_T3,
  };
}

export const priceIdForTier = (env: Env, tier: string): string | undefined => priceMap(env)[tier];

export function tierForPriceId(env: Env, priceId: string): string | undefined {
  for (const [tier, pid] of Object.entries(priceMap(env))) {
    if (pid && pid === priceId) return tier;
  }
  return undefined;
}
