import { toCents } from "../money.js";
import type { Entitlements, Feature, Tier } from "../types.js";

/* ------------------------------------------------------------------ *
 * The plans
 *   Base   — one-time purchase, manual money management (level 0)
 *   T1/2/3 — individual monthly subscriptions (levels 1–3)
 *   Family — up to 5 people, mirrors the T-level plus family tools
 *
 * `level` drives gating: a tier grants every feature whose level is <=
 * the tier level. Family tiers carry the same level as their individual
 * equivalent and additionally unlock family-only features.
 * ------------------------------------------------------------------ */
export const TIERS: Tier[] = [
  {
    id: "base",
    name: "Base App",
    group: "base",
    priceCents: 0,
    interval: "once",
    memberLimit: 1,
    level: 0,
    tagline: "Free forever. Manual, private, offline.",
    highlights: [
      "Manual transaction entry",
      "Manual budgeting",
      "Manual goals",
      "Manual debt tracking",
      "Manual investment tracking",
      "Custom categories & tags",
      "Basic monthly totals",
      "Basic CSV export",
      "Offline mode",
      "Local-only data",
      "Biometric login",
      "Incognito mode",
    ],
  },
  {
    id: "ind_t1",
    name: "Tier 1",
    group: "individual",
    priceCents: toCents(5),
    annualPriceCents: toCents(44.99),
    interval: "month",
    memberLimit: 1,
    level: 1,
    tagline: "Ends manual work — saves most people $300–$800/yr in accidental waste.",
    highlights: [
      "Multi-account support",
      "Auto-categorization",
      "Recurring transactions",
      "Subscription, refund & transfer detection",
      "Merchant cleanup",
      "Pending transaction tracking",
      "Weekly & bi-weekly budgets",
      "Category rollover rules",
      "Overspending alerts",
      "Safe-to-Spend indicator",
      "Budget templates & auto-suggestions",
      "Savings, debt & investment goals + reminders",
      "Category breakdown, income vs. expenses & spending heatmap",
      "Subscription spending report",
      "Receipt OCR (mobile) & quick-add widgets",
      "Desktop CSV import",
      "AI category tagging & subscription detection",
    ],
  },
  {
    id: "ind_t2",
    name: "Tier 2",
    group: "individual",
    priceCents: toCents(9),
    annualPriceCents: toCents(79.99),
    interval: "month",
    memberLimit: 1,
    level: 2,
    tagline: "Improves outcomes — most people save $1,000–$3,000/yr through optimization.",
    highlight: true,
    highlights: [
      "Itemized split transactions & merchant merging",
      "Hide-from-trends toggle & shared bill splitting",
      "Budget forecasting & month-to-month comparison",
      "Flex categories, income-paced budgeting & sinking funds",
      "One-click cover & round-up savings simulation",
      "Multi-asset goals, forecasting & completion timelines",
      "Sneaky-expenses, merchant spending & cashflow analysis",
      "Net worth tracking & custom report builder",
      "Snowball & avalanche planners, interest & payoff projections",
      "Extra-payment simulator",
      "Portfolio overview, performance, allocation & growth projections",
      "AI Budget Advisor & Savings Optimizer",
      "Natural-language financial search",
      "Basic tax bracket, net income, sales tax & withholding awareness",
    ],
  },
  {
    id: "ind_t3",
    name: "Tier 3",
    group: "individual",
    priceCents: toCents(13),
    annualPriceCents: toCents(114.99),
    interval: "month",
    memberLimit: 1,
    level: 3,
    tagline: "Replaces a tax advisor, debt strategist & planner — save $2,000–$10,000/yr.",
    highlights: [
      "Interactive bill calendar & goal priority stacking",
      "Opportunity-cost simulator, Sankey diagrams & life-event reports",
      "Peer benchmarking",
      "BNPL, promotional-APR & statutory-interest tracking",
      "Debt consolidation & refinancing modeling",
      "Dividend & cost-basis tracking, risk profile & fee analyzer",
      "Employer-match optimizer, crypto watcher & rebalancing alerts",
      "Full tax intelligence (federal/state/city/county)",
      "Filing status, dependent & itemized-vs-standard modeling",
      "Real-time liability/refund projection & paycheck preview",
      "Quarterly estimated tax, business expense & mileage tracking",
      "Property, vehicle, capital gains, retirement, HSA & ESPP/RSU tax modeling",
      "AI deduction finder, withholding optimizer & anomaly detection",
      "AI Debt Strategy Planner, Forecasting & Financial Health Score",
      "AI negotiation scripts & impulse guard",
      "SOC 2 Type II, local database encryption & valuation hooks",
      "Optional gamification (full suite)",
    ],
  },
  {
    id: "fam_t1",
    name: "Family Tier 1",
    group: "family",
    priceCents: toCents(12.99),
    annualPriceCents: toCents(119.99),
    interval: "month",
    memberLimit: 5,
    level: 1,
    tagline: "Tier 1 for up to 5 people.",
    highlights: [
      "Everything in Tier 1",
      "Add up to 5 members",
      "Shared budgets & goals",
      "Family dashboard & activity logs",
      "Permissions (view/edit) & family notifications",
      "Child/teen accounts with spending limits",
    ],
  },
  {
    id: "fam_t2",
    name: "Family Tier 2",
    group: "family",
    priceCents: toCents(22.99),
    annualPriceCents: toCents(199.99),
    interval: "month",
    memberLimit: 5,
    level: 2,
    tagline: "Tier 2 for up to 5 people.",
    highlight: true,
    highlights: [
      "Everything in Family T1 + Tier 2",
      "Purchase approval workflow",
      "Family analytics & net worth aggregation",
      "Transaction assigner & His/Hers/Ours split views",
      "Chore & allowance managers",
      "Financial literacy academy",
    ],
  },
  {
    id: "fam_t3",
    name: "Family Tier 3",
    group: "family",
    priceCents: toCents(32.99),
    annualPriceCents: toCents(299.99),
    interval: "month",
    memberLimit: 5,
    level: 3,
    tagline: "Tier 3 for up to 5 people.",
    highlights: [
      "Everything in Family T2 + Tier 3",
      "Family XP pool, level, challenges & achievements",
      "Kid/teen gamification & shared seasonal events",
      "Advanced His/Hers/Ours automation",
      "Partner goal stacking, impulse guard & forecasting",
      "Advisor portal access (family)",
    ],
  },
];

export const tierById = (id: string): Tier => TIERS.find((t) => t.id === id) ?? TIERS[0]!;

/** Legacy tier ids → their closest current equivalent (for old accounts/DBs). */
export function normalizeTierId(id: string | null | undefined): string {
  if (id && TIERS.some((t) => t.id === id)) return id;
  switch (id) {
    case "free":
      return "base";
    case "custom":
      return "fam_t3";
    default:
      return "base";
  }
}

/* ------------------------------------------------------------------ *
 * Enforced features → the app capabilities that are actually gated.
 * `level` is the minimum tier level that unlocks the feature. These keys
 * map to real pages / API routers, so gating them changes what a user
 * can actually do (unlike the marketing `highlights` above).
 * ------------------------------------------------------------------ */
export const FEATURES: Feature[] = [
  // Base (level 0) — core manual money management
  { key: "transactions", label: "Transactions", description: "Manual entry, categories & tags", level: 0 },
  { key: "budgets", label: "Budgets", description: "Monthly limits & rollover", level: 0 },
  { key: "goals", label: "Goals", description: "Savings / debt / investment targets", level: 0 },
  { key: "debt", label: "Debt tracking", description: "Track balances, APRs & minimums", level: 0 },
  { key: "accounts", label: "Accounts", description: "Balances across your accounts", level: 0 },
  { key: "export", label: "CSV export", description: "Export your transactions", level: 0 },
  // Tier 1 (level 1) — automation & insight
  { key: "recurring", label: "Recurring & subscription detection", description: "Auto-detect repeating charges", level: 1 },
  { key: "reports", label: "Reports & trends", description: "Breakdowns, cashflow, heatmap", level: 1 },
  { key: "insights", label: "Smart cleanup & alerts", description: "Dedupe, refunds, auto-budget, auto-tag, overspend alerts", level: 1 },
  // Tier 2 (level 2) — wealth & AI
  { key: "investments", label: "Investments", description: "Portfolio, allocation & growth", level: 2 },
  { key: "networth", label: "Net worth", description: "Unified assets vs. liabilities + history", level: 2 },
  { key: "ai", label: "AI insights", description: "Advisor, optimizer, NL search", level: 2 },
  { key: "forecast", label: "Forecast & optimization", description: "Cashflow forecast, income pacing, sinking funds", level: 2 },
  // Tier 3 (level 3) — pro suite
  { key: "gamification", label: "Rewards & gamification", description: "XP, levels, achievements", level: 3 },
  { key: "tax", label: "Tax intelligence", description: "Full federal/state tax modeling", level: 3 },
  { key: "advisor", label: "Advisor portal", description: "Share access with a pro", level: 3 },
  { key: "intelligence", label: "Money intelligence", description: "Tax, debt, investment & life intelligence", level: 3 },
  // Family plans only
  { key: "family", label: "Family management", description: "Up to 5 members, allowances, overview", level: 1, familyOnly: true },
];

export const featureByKey = (key: string): Feature | undefined => FEATURES.find((f) => f.key === key);

/* ------------------------------------------------------------------ *
 * Gating
 * ------------------------------------------------------------------ */
export function hasFeature(tier: Tier, key: string): boolean {
  const feature = featureByKey(key);
  if (!feature) return false;
  if (feature.familyOnly && tier.group !== "family") return false;
  return tier.level >= feature.level;
}

export function featuresForTier(tier: Tier): string[] {
  return FEATURES.filter((f) => hasFeature(tier, f.key)).map((f) => f.key);
}

export function resolveEntitlements(tierId: string): Entitlements {
  const tier = tierById(normalizeTierId(tierId));
  return {
    tier,
    features: featuresForTier(tier),
    memberLimit: tier.memberLimit,
    canManageFamily: tier.group === "family",
  };
}
