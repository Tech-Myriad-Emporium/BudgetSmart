import type { Env } from "./types.js";

// Mirror of the tier ids in @budgetsmart/shared. The app resolves the actual
// feature set from the tier id locally; the central API only needs to know the
// valid tiers and how they map to Stripe prices (monthly + annual).
export const SUBSCRIPTION_TIERS = ["ind_t1", "ind_t2", "ind_t3", "fam_t1", "fam_t2", "fam_t3"] as const;
export const ALL_TIERS = ["base", ...SUBSCRIPTION_TIERS] as const;
export type TierId = (typeof ALL_TIERS)[number];
export type Interval = "month" | "year";

export const isValidTier = (t: string): t is TierId => (ALL_TIERS as readonly string[]).includes(t);
export const isSubscriptionTier = (t: string): boolean => (SUBSCRIPTION_TIERS as readonly string[]).includes(t);
export const isInterval = (i: string): i is Interval => i === "month" || i === "year";

function priceMap(env: Env): Record<string, { month?: string; year?: string }> {
  return {
    ind_t1: { month: env.STRIPE_PRICE_IND_T1_MONTH, year: env.STRIPE_PRICE_IND_T1_YEAR },
    ind_t2: { month: env.STRIPE_PRICE_IND_T2_MONTH, year: env.STRIPE_PRICE_IND_T2_YEAR },
    ind_t3: { month: env.STRIPE_PRICE_IND_T3_MONTH, year: env.STRIPE_PRICE_IND_T3_YEAR },
    fam_t1: { month: env.STRIPE_PRICE_FAM_T1_MONTH, year: env.STRIPE_PRICE_FAM_T1_YEAR },
    fam_t2: { month: env.STRIPE_PRICE_FAM_T2_MONTH, year: env.STRIPE_PRICE_FAM_T2_YEAR },
    fam_t3: { month: env.STRIPE_PRICE_FAM_T3_MONTH, year: env.STRIPE_PRICE_FAM_T3_YEAR },
  };
}

export const priceIdForTier = (env: Env, tier: string, interval: Interval): string | undefined =>
  priceMap(env)[tier]?.[interval];

export function tierForPriceId(env: Env, priceId: string): string | undefined {
  for (const [tier, m] of Object.entries(priceMap(env))) {
    if (m.month === priceId || m.year === priceId) return tier;
  }
  return undefined;
}
