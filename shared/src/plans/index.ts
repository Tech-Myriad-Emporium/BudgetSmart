import { toCents } from "../money.js";

/* ------------------------------------------------------------------ *
 * Custom & Enterprise plan builder.
 *
 * Teams pick à-la-carte capabilities; the NUMBER of selected items drives
 * step pricing (not each individual item). Custom starts at 6 seats,
 * Enterprise at 30. Orders are submitted (not checked out) — the API scans
 * the order, emails a receipt, and once paid issues a redeemable code that
 * unlocks the plan and lets the buyer share it by email.
 * ------------------------------------------------------------------ */

export interface PlanFeature {
  key: string;
  label: string;
  /** Always bundled; can't be unchecked (still counts toward the item total). */
  required?: boolean;
}

export const PLAN_FEATURES: PlanFeature[] = [
  { key: "core", label: "Core money management — accounts, transactions, budgets, goals, debt, CSV export", required: true },
  { key: "import", label: "Bank statement import (CSV/OFX/QIF) + AI auto-categorization" },
  { key: "recurring", label: "Subscription detection & price-creep alerts" },
  { key: "insights", label: "Smart cleanup — dedupe, refunds, auto-budget, overspending alerts" },
  { key: "reports", label: "Reports & trends + weekly/monthly email recaps" },
  { key: "calendar", label: "Financial calendar (bills, paychecks, milestones)" },
  { key: "investments", label: "Investment tracking & growth projections" },
  { key: "networth", label: "Net worth tracking with history" },
  { key: "forecast", label: "90-day cashflow forecasting, income pacing & sinking funds" },
  { key: "ai", label: "AI advisor, savings optimizer & financial health score" },
  { key: "tax", label: "Tax intelligence — projections, quarterly estimates, deduction finder" },
  { key: "intelligence", label: "Debt & investment intelligence + AI negotiation scripts" },
  { key: "audit", label: "Audit trail & compliance logging" },
  { key: "team", label: "Team management — wallets, approvals, shared goals" },
  { key: "priority", label: "Priority support & onboarding" },
];

export const PLAN_FEATURE_KEYS = PLAN_FEATURES.map((f) => f.key);
export const planFeatureLabel = (key: string): string =>
  PLAN_FEATURES.find((f) => f.key === key)?.label ?? key;

/** Step pricing: per-person annual price is set by how many features are
 *  selected, in bands. Choosing more capabilities moves you up a band. */
export interface StepBand {
  /** Inclusive upper bound on the selected item count. */
  maxItems: number;
  /** USD per person per year. */
  perPersonYear: number;
  label: string;
}

// Bands are deliberately volume-priced: even the top band sits UNDER the
// cheapest per-person Family rate ($60/person/yr on Family T3), so by the time
// a team wants 11–15 features it's cheaper to buy Custom/Enterprise than to
// stack Family plans (which also force rigid 5-seat blocks).
export const STEP_BANDS: StepBand[] = [
  { maxItems: 5, perPersonYear: 18, label: "Up to 5 features" },
  { maxItems: 10, perPersonYear: 30, label: "6–10 features" },
  { maxItems: 14, perPersonYear: 42, label: "11–14 features" },
  { maxItems: 999, perPersonYear: 48, label: "All 15 features (everything)" },
];

export const MIN_CUSTOM_SEATS = 6;
export const MIN_ENTERPRISE_SEATS = 30;
export const SEAT_BLOCK = 30;
export const BLOCK_FEE = 60; // per started block of 30 seats (setup & support)

export function bandForItemCount(count: number): StepBand {
  return STEP_BANDS.find((b) => count <= b.maxItems) ?? STEP_BANDS[STEP_BANDS.length - 1]!;
}

export type PlanType = "custom" | "enterprise";

export function planTypeForSeats(seats: number): PlanType {
  return seats >= MIN_ENTERPRISE_SEATS ? "enterprise" : "custom";
}

export interface PlanQuote {
  planType: PlanType;
  seats: number;
  itemCount: number;
  perPersonYear: number;
  bandLabel: string;
  blocks: number;
  blockFee: number;
  /** Whole USD / year. */
  total: number;
  totalCents: number;
  minSeats: number;
}

/** Authoritative quote. The client shows it live; the API recomputes it on
 *  submit so the emailed receipt never trusts a client-supplied price. */
export function quotePlan(seats: number, itemCount: number): PlanQuote {
  const planType = planTypeForSeats(seats);
  const minSeats = planType === "enterprise" ? MIN_ENTERPRISE_SEATS : MIN_CUSTOM_SEATS;
  const clampedSeats = Math.max(minSeats, Math.floor(seats) || minSeats);
  const items = Math.max(1, Math.floor(itemCount) || 1);
  const band = bandForItemCount(items);
  const blocks = Math.ceil(clampedSeats / SEAT_BLOCK);
  const blockFee = BLOCK_FEE * blocks;
  const total = band.perPersonYear * clampedSeats + blockFee;
  return {
    planType,
    seats: clampedSeats,
    itemCount: items,
    perPersonYear: band.perPersonYear,
    bandLabel: band.label,
    blocks,
    blockFee,
    total,
    totalCents: toCents(total),
    minSeats,
  };
}

/** Normalize a list of requested item keys → known keys, always including
 *  the required ones, de-duplicated, in canonical order. */
export function normalizePlanItems(keys: string[]): string[] {
  const requested = new Set(keys);
  return PLAN_FEATURES.filter((f) => f.required || requested.has(f.key)).map((f) => f.key);
}
