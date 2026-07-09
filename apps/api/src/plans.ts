// Mirror of @budgetsmart/shared plans (the Worker is standalone and can't
// import the shared package). Keep the step bands, seat minimums and item
// labels in sync with shared/src/plans. The API is the authority for the
// quote it puts on an emailed receipt — it never trusts a client price.

export interface PlanFeature {
  key: string;
  label: string;
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

const FEATURE_KEYS = new Set(PLAN_FEATURES.map((f) => f.key));
export const planFeatureLabel = (key: string): string =>
  PLAN_FEATURES.find((f) => f.key === key)?.label ?? key;

export interface StepBand {
  maxItems: number;
  perPersonYear: number;
  label: string;
}
export const STEP_BANDS: StepBand[] = [
  { maxItems: 5, perPersonYear: 18, label: "Up to 5 features" },
  { maxItems: 10, perPersonYear: 30, label: "6–10 features" },
  { maxItems: 14, perPersonYear: 42, label: "11–14 features" },
  { maxItems: 999, perPersonYear: 48, label: "All 15 features (everything)" },
];

export const MIN_CUSTOM_SEATS = 6;
export const MIN_ENTERPRISE_SEATS = 30;
export const SEAT_BLOCK = 30;
export const BLOCK_FEE = 60;

export type PlanType = "custom" | "enterprise";

function bandForItemCount(count: number): StepBand {
  return STEP_BANDS.find((b) => count <= b.maxItems) ?? STEP_BANDS[STEP_BANDS.length - 1]!;
}

/** Requested keys → known keys, required ones forced in, canonical order. */
export function normalizePlanItems(keys: string[]): string[] {
  const requested = new Set(keys.filter((k) => FEATURE_KEYS.has(k)));
  return PLAN_FEATURES.filter((f) => f.required || requested.has(f.key)).map((f) => f.key);
}

export interface PlanQuote {
  planType: PlanType;
  seats: number;
  items: string[];
  itemCount: number;
  perPersonYear: number;
  bandLabel: string;
  blocks: number;
  blockFee: number;
  total: number;
  totalCents: number;
  minSeats: number;
}

/** Authoritative server-side quote from a raw order. */
export function quoteOrder(rawSeats: number, rawItems: string[]): PlanQuote {
  const items = normalizePlanItems(rawItems);
  const itemCount = items.length;
  const planType: PlanType = rawSeats >= MIN_ENTERPRISE_SEATS ? "enterprise" : "custom";
  const minSeats = planType === "enterprise" ? MIN_ENTERPRISE_SEATS : MIN_CUSTOM_SEATS;
  const seats = Math.max(minSeats, Math.floor(rawSeats) || minSeats);
  const band = bandForItemCount(itemCount);
  const blocks = Math.ceil(seats / SEAT_BLOCK);
  const blockFee = BLOCK_FEE * blocks;
  const total = band.perPersonYear * seats + blockFee;
  return {
    planType,
    seats,
    items,
    itemCount,
    perPersonYear: band.perPersonYear,
    bandLabel: band.label,
    blocks,
    blockFee,
    total,
    totalCents: total * 100,
    minSeats,
  };
}
