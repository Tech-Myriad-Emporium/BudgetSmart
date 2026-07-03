import type { Cents } from "./money.js";

/* ------------------------------------------------------------------ *
 * Enums (stored as strings — SQLite has no native enum type)
 * ------------------------------------------------------------------ */

export const ACCOUNT_TYPES = ["cash", "checking", "savings", "credit", "loan"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: "Cash",
  checking: "Checking",
  savings: "Savings",
  credit: "Credit Card",
  loan: "Loan",
};

/** Liability accounts carry debt: a positive balance means money owed. */
export const LIABILITY_ACCOUNT_TYPES: ReadonlySet<AccountType> = new Set(["credit", "loan"]);

export const CATEGORY_KINDS = ["income", "expense"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const TRANSACTION_TYPES = ["income", "expense", "transfer"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const ROLLOVER_MODES = ["none", "positive", "full"] as const;
export type RolloverMode = (typeof ROLLOVER_MODES)[number];

/* ------------------------------------------------------------------ *
 * Domain entities (shape returned by the API)
 * ------------------------------------------------------------------ */

export interface User {
  id: string;
  email: string;
  name: string;
  currency: string; // ISO 4217, e.g. "USD"
  /** Completed the in-app onboarding tour. */
  onboarded: boolean;
  createdAt: string; // ISO timestamp
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** Starting balance in cents when the account was added to BudgetSmart. */
  openingBalance: Cents;
  /** Current balance = openingBalance + net of all posted transactions. */
  balance: Cents;
  currency: string;
  archived: boolean;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  /** Parent category for sub-categories (one level deep), or null. */
  parentId: string | null;
  icon: string; // emoji or icon key
  color: string; // hex
  rollover: RolloverMode;
  /** Hidden categories are excluded from trends/budgets. */
  hidden: boolean;
  createdAt: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  /** For transfers, the destination account. */
  transferAccountId: string | null;
  categoryId: string | null;
  type: TransactionType;
  /** Always a positive magnitude in cents; `type` decides the sign of its effect. */
  amount: Cents;
  merchant: string;
  note: string | null;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  pending: boolean;
  /** Excluded from trends/budgets when true. */
  excluded: boolean;
  tags: string[];
  createdAt: string;
}

export interface Budget {
  id: string;
  categoryId: string;
  /** Budget period this row belongs to, as YYYY-MM. */
  month: string;
  limit: Cents;
  createdAt: string;
}

/* ------------------------------------------------------------------ *
 * Derived / computed view models
 * ------------------------------------------------------------------ */

export interface BudgetLine {
  categoryId: string;
  categoryName: string;
  icon: string;
  color: string;
  rollover: RolloverMode;
  limit: Cents;
  /** Amount rolled over from the prior month (can be negative). */
  rolledOver: Cents;
  /** Total available = limit + rolledOver. */
  available: Cents;
  /** Spent this month in this category (expenses only). */
  spent: Cents;
  /** available - spent. Negative means overspent. */
  remaining: Cents;
  /** 0..1 progress of spent against available. */
  progress: number;
  overspent: boolean;
}

export interface BudgetSummary {
  month: string;
  totalLimit: Cents;
  totalSpent: Cents;
  totalRemaining: Cents;
  lines: BudgetLine[];
}

export interface SafeToSpend {
  /** Liquid balance across non-liability accounts. */
  liquid: Cents;
  /** Sum of remaining (positive) budget across expense categories this month. */
  budgetedRemaining: Cents;
  /** Income still expected this month (currently 0 until forecasting lands). */
  expectedIncome: Cents;
  /** The headline number a user can safely spend right now. */
  amount: Cents;
}

export interface CategorySpend {
  categoryId: string | null;
  categoryName: string;
  icon: string;
  color: string;
  spent: Cents;
  /** share of total spend, 0..1 */
  share: number;
}

/* ------------------------------------------------------------------ *
 * Goals
 * ------------------------------------------------------------------ */

export const GOAL_TYPES = ["savings", "debt", "investment", "custom"] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  savings: "Savings",
  debt: "Debt payoff",
  investment: "Investment",
  custom: "Custom",
};

export interface Goal {
  id: string;
  name: string;
  type: GoalType;
  icon: string;
  color: string;
  targetAmount: Cents;
  /** Amount saved toward the goal so far. */
  currentAmount: Cents;
  /** Optional deadline (YYYY-MM-DD). */
  targetDate: string | null;
  /** Planned monthly contribution, used for projections. */
  monthlyContribution: Cents;
  note: string | null;
  /** Lower number = higher priority (drag-to-reorder later). */
  priority: number;
  /** Shared with the family — members can contribute from their wallets. */
  shared: boolean;
  createdAt: string;
}

export type GoalStatus =
  | "complete"
  | "no-target-date"
  | "ahead"
  | "on-track"
  | "behind"
  | "overdue";

export interface GoalProgress {
  goalId: string;
  /** currentAmount / targetAmount, clamped 0..1. */
  progress: number;
  remaining: Cents;
  complete: boolean;
  /** Whole months until targetDate (negative if past), or null when no date. */
  monthsRemaining: number | null;
  /** Contribution/month needed to hit target by targetDate. */
  requiredMonthly: Cents | null;
  /** Months to finish at the planned monthlyContribution. */
  projectedMonths: number | null;
  /** Approximate completion date at the planned pace (YYYY-MM-DD). */
  projectedDate: string | null;
  status: GoalStatus;
  /** Next milestone threshold (0.25 / 0.5 / 0.75 / 1), or null if complete. */
  nextMilestone: number | null;
}

export interface GoalWithProgress extends Goal {
  computed: GoalProgress;
}

export interface GoalsSummary {
  totalTarget: Cents;
  totalSaved: Cents;
  totalRemaining: Cents;
  activeCount: number;
  completedCount: number;
  goals: GoalWithProgress[];
}

/* ------------------------------------------------------------------ *
 * Debt
 * ------------------------------------------------------------------ */

export const DEBT_KINDS = [
  "credit_card",
  "student_loan",
  "auto",
  "personal",
  "medical",
  "mortgage",
  "other",
] as const;
export type DebtKind = (typeof DEBT_KINDS)[number];

export const DEBT_KIND_LABELS: Record<DebtKind, string> = {
  credit_card: "Credit Card",
  student_loan: "Student Loan",
  auto: "Auto Loan",
  personal: "Personal Loan",
  medical: "Medical",
  mortgage: "Mortgage",
  other: "Other",
};

export const DEBT_STRATEGIES = ["snowball", "avalanche"] as const;
export type DebtStrategy = (typeof DEBT_STRATEGIES)[number];

export interface Debt {
  id: string;
  name: string;
  kind: DebtKind;
  icon: string;
  color: string;
  /** Current principal owed, in cents. */
  balance: Cents;
  /** Annual percentage rate in basis points (1999 = 19.99%). */
  aprBps: number;
  /** Required minimum monthly payment, in cents. */
  minimumPayment: Cents;
  createdAt: string;
}

export interface DebtsOverview {
  totalBalance: Cents;
  totalMinimum: Cents;
  /** Balance-weighted average APR, in basis points. */
  weightedAprBps: number;
  count: number;
  debts: Debt[];
}

export interface PayoffEntry {
  debtId: string;
  /** 1-based position in the payoff order. */
  order: number;
  /** Month index (1-based) the debt is cleared, or null if not within the horizon. */
  payoffMonthIndex: number | null;
  payoffDate: string | null;
  interestPaid: Cents;
}

export interface PayoffPoint {
  monthIndex: number;
  totalBalance: Cents;
}

export interface PayoffPlan {
  strategy: DebtStrategy;
  extraPerMonth: Cents;
  /** Months until debt-free (capped at the horizon if not viable). */
  totalMonths: number;
  debtFreeDate: string | null;
  totalInterest: Cents;
  totalPaid: Cents;
  totalPrincipal: Cents;
  /** True if every debt is paid off within the horizon. */
  viable: boolean;
  entries: PayoffEntry[];
  timeline: PayoffPoint[];
  /** Same strategy with no extra payment, for comparison. */
  baseline: { totalMonths: number; totalInterest: Cents; debtFreeDate: string | null };
  interestSaved: Cents;
  monthsSaved: number;
}

/* ------------------------------------------------------------------ *
 * Credit-card calculator
 * ------------------------------------------------------------------ */

export interface CreditCardScenario {
  key: string;
  label: string;
  /** Fixed monthly payment for this scenario (the initial minimum, for min-only). */
  monthlyPayment: Cents;
  months: number;
  totalInterest: Cents;
  totalPaid: Cents;
  payoffDate: string | null;
  /** False if it never clears within the projection horizon. */
  viable: boolean;
}

export type UtilizationBand = "excellent" | "good" | "fair" | "high" | "maxed";

export interface CreditGainEstimate {
  creditLimit: Cents;
  currentBalance: Cents;
  /** balance / limit (0..1+). */
  currentUtilization: number;
  /** Balance that puts utilization at the 30% "healthy" line. */
  healthyBalance: Cents;
  /** Balance that puts utilization at the 10% "excellent" line. */
  excellentBalance: Cents;
  band: UtilizationBand;
  /** Rough estimated score points to gain by reaching ~10% utilization. */
  estimatedScoreGain: number;
}

export interface CreditCardAnalysis {
  balance: Cents;
  aprBps: number;
  /** Issuer-style minimum payment on the current balance. */
  minimumPayment: Cents;
  /** Interest accruing on the current balance in one month. */
  monthlyInterest: Cents;
  scenarios: CreditCardScenario[];
  /** The "most beneficial" reasonable scenario. */
  recommended: CreditCardScenario;
  interestSavedVsMin: Cents;
  monthsSavedVsMin: number;
  credit: CreditGainEstimate;
}

/* ------------------------------------------------------------------ *
 * Reports
 * ------------------------------------------------------------------ */

export interface CashflowPoint {
  month: string; // YYYY-MM
  income: Cents;
  expense: Cents;
  net: Cents;
}

export interface NetWorthPoint {
  month: string; // YYYY-MM (as of month end)
  assets: Cents;
  liabilities: Cents;
  net: Cents;
}

export interface MerchantSpend {
  merchant: string;
  total: Cents;
  count: number;
}

export interface ReportSummary {
  months: number;
  totalIncome: Cents;
  totalExpense: Cents;
  net: Cents;
  avgMonthlyExpense: Cents;
  /** (income - expense) / income, 0..1 (0 when no income). */
  savingsRate: number;
}

export interface ReportData {
  months: string[];
  cashflow: CashflowPoint[];
  netWorth: NetWorthPoint[];
  categoryBreakdown: CategorySpend[];
  topMerchants: MerchantSpend[];
  summary: ReportSummary;
}

/* ------------------------------------------------------------------ *
 * Investments
 * ------------------------------------------------------------------ */

export const ASSET_CLASSES = ["stock", "etf", "crypto", "bond", "cash", "real_estate", "other"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  stock: "Stocks",
  etf: "ETFs",
  crypto: "Crypto",
  bond: "Bonds",
  cash: "Cash",
  real_estate: "Real Estate",
  other: "Other",
};

export interface Holding {
  id: string;
  name: string;
  symbol: string;
  assetClass: AssetClass;
  /** Free-form account label, e.g. "401(k)", "Roth IRA", "Brokerage". */
  accountLabel: string;
  /** Units held (shares/coins); may be fractional. */
  quantity: number;
  /** Total amount invested, in cents. */
  costBasis: Cents;
  /** Latest price per unit, in cents. */
  currentPrice: Cents;
  createdAt: string;
}

export interface HoldingMetrics extends Holding {
  /** quantity × currentPrice. */
  value: Cents;
  /** value − costBasis (unrealized). */
  gain: Cents;
  /** gain / costBasis, 0..1 (can be negative). */
  gainPct: number;
  /** costBasis / quantity. */
  avgCost: Cents;
  /** value share of the whole portfolio, 0..1. */
  weight: number;
}

export interface Allocation {
  assetClass: AssetClass;
  label: string;
  color: string;
  value: Cents;
  share: number;
}

export interface Portfolio {
  totalValue: Cents;
  totalCost: Cents;
  totalGain: Cents;
  totalGainPct: number;
  allocation: Allocation[];
  holdings: HoldingMetrics[];
}

export interface ProjectionPoint {
  year: number;
  value: Cents;
  contributed: Cents;
  growth: Cents;
}

export interface GrowthProjection {
  years: number;
  monthlyContribution: Cents;
  annualReturnPct: number;
  startValue: Cents;
  endValue: Cents;
  totalContributed: Cents;
  totalGrowth: Cents;
  points: ProjectionPoint[];
}

/* ------------------------------------------------------------------ *
 * Recurring / subscription detection
 * ------------------------------------------------------------------ */

export const CADENCES = ["weekly", "biweekly", "monthly", "yearly"] as const;
export type Cadence = (typeof CADENCES)[number];

export const CADENCE_LABELS: Record<Cadence, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  yearly: "Yearly",
};

export interface RecurringItem {
  /** Normalized merchant key. */
  key: string;
  merchant: string;
  categoryId: string | null;
  categoryName: string;
  icon: string;
  color: string;
  cadence: Cadence;
  /** Representative charge amount, in cents. */
  typicalAmount: Cents;
  /** Normalized monthly cost in cents (cadence-adjusted). */
  monthlyCost: Cents;
  occurrences: number;
  lastDate: string;
  nextDate: string;
  /** 0..1 confidence in the detection. */
  confidence: number;
  isSubscription: boolean;
}

export interface UpcomingCharge {
  key: string;
  merchant: string;
  icon: string;
  color: string;
  date: string;
  amount: Cents;
  daysAway: number;
}

export interface RecurringSummary {
  items: RecurringItem[];
  totalMonthly: Cents;
  totalAnnual: Cents;
  subscriptionCount: number;
  subscriptionMonthly: Cents;
  upcoming: UpcomingCharge[];
}

/* ------------------------------------------------------------------ *
 * Net worth (unified: accounts + investments − liability accounts − debts)
 * ------------------------------------------------------------------ */

export interface NetWorthComponent {
  key: string;
  label: string;
  value: Cents;
  kind: "asset" | "liability";
  color: string;
  /** Share of its own side's total (assets or liabilities), 0..1. */
  share: number;
}

export interface NetWorthBreakdown {
  assetAccounts: Cents;
  investments: Cents;
  totalAssets: Cents;
  liabilityAccounts: Cents;
  debts: Cents;
  totalLiabilities: Cents;
  net: Cents;
  /** Debt-to-asset ratio, 0..1+ (0 when no assets). */
  leverage: number;
  components: NetWorthComponent[];
}

export interface NetWorthDetail {
  breakdown: NetWorthBreakdown;
  /** Monthly history (accounts move with activity; investments/debts held at today's value). */
  history: NetWorthPoint[];
}

/* ------------------------------------------------------------------ *
 * Gamification
 * ------------------------------------------------------------------ */

/** Raw activity stats the engine turns into XP, streaks and unlocks. */
export interface GamificationStats {
  transactionCount: number;
  /** Distinct YYYY-MM-DD dates with a transaction, for streaks. */
  activeDays: string[];
  budgetsSet: number;
  goalsCreated: number;
  goalsReached: number;
  debtsTracked: number;
  holdings: number;
  recurringDetected: number;
  netWorthPositive: boolean;
  monthsTracked: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  xp: number;
  unlocked: boolean;
}

export interface Challenge {
  id: string;
  name: string;
  icon: string;
  target: number;
  current: number;
  progress: number; // 0..1
  reward: number; // SmartCoins
  done: boolean;
}

export interface GamificationState {
  xp: number;
  level: number;
  rank: string;
  xpIntoLevel: number;
  xpForNextLevel: number;
  levelProgress: number; // 0..1
  currentStreak: number;
  longestStreak: number;
  smartCoins: number;
  achievements: Achievement[];
  achievementsUnlocked: number;
  challenges: Challenge[];
}

/* ------------------------------------------------------------------ *
 * Subscription tiers & entitlements
 * ------------------------------------------------------------------ */

export type TierGroup = "base" | "individual" | "family";

export interface Tier {
  id: string;
  name: string;
  group: TierGroup;
  /** Monthly price in cents (per `interval`). */
  priceCents: Cents;
  /** Annual price in cents (subscription tiers only). Undefined for Base. */
  annualPriceCents?: Cents;
  /** "once" = one-time purchase (Base app); "month" = recurring subscription. */
  interval: "month" | "once";
  /** Max members on the plan (1 for base/individual, up to 5 for family). */
  memberLimit: number;
  /** Feature level 0–3 (base→t3). */
  level: number;
  tagline: string;
  highlight?: boolean;
  /** Marketing bullet list of what this tier adds (over the previous one). */
  highlights: string[];
}

export interface Feature {
  key: string;
  label: string;
  description: string;
  /** Minimum feature level required (0–3). */
  level: number;
  /** Only available on family plans. */
  familyOnly?: boolean;
}

export interface Entitlements {
  tier: Tier;
  /** Feature keys the tier grants. */
  features: string[];
  memberLimit: number;
  canManageFamily: boolean;
}

/* ------------------------------------------------------------------ *
 * Family (family-plan members + allowance wallet)
 * ------------------------------------------------------------------ */

export const FAMILY_ROLES = ["partner", "teen", "child"] as const;
export type FamilyRole = (typeof FAMILY_ROLES)[number];

export const FAMILY_ROLE_LABELS: Record<FamilyRole, string> = {
  partner: "Partner",
  teen: "Teen",
  child: "Child",
};

export interface FamilyMember {
  id: string;
  name: string;
  role: FamilyRole;
  color: string;
  /** Allowance wallet balance in cents (owner can only add; member spends/invests). */
  balance: Cents;
  allowanceTotal: Cents;
  spentTotal: Cents;
  investedTotal: Cents;
  createdAt: string;
}

export const FAMILY_LEDGER_KINDS = ["allowance", "spend", "invest"] as const;
export type FamilyLedgerKind = (typeof FAMILY_LEDGER_KINDS)[number];

export interface FamilyLedgerEntry {
  id: string;
  memberId: string;
  kind: FamilyLedgerKind;
  amount: Cents;
  note: string | null;
  date: string;
  createdAt: string;
}

/** A chore the owner assigns to a member; completing it credits the wallet. */
export interface Chore {
  id: string;
  memberId: string;
  name: string;
  reward: Cents;
  /** Repeatable chores stay open after completion (e.g. weekly trash duty). */
  repeats: boolean;
  timesDone: number;
  lastDoneAt: string | null;
  createdAt: string;
}

export const PURCHASE_REQUEST_STATUSES = ["pending", "approved", "declined"] as const;
export type PurchaseRequestStatus = (typeof PURCHASE_REQUEST_STATUSES)[number];

/** A member's purchase request; approving deducts it from their wallet. */
export interface PurchaseRequest {
  id: string;
  memberId: string;
  title: string;
  amount: Cents;
  status: PurchaseRequestStatus;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface FamilyOverview {
  members: FamilyMember[];
  memberCount: number;
  memberLimit: number;
  totalAllowance: Cents;
  totalBalance: Cents;
  totalSpent: Cents;
  totalInvested: Cents;
}
