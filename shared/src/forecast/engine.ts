// T2 foresight: cashflow forecasting, income-paced budgeting, sinking funds,
// sneaky-expense detection, and the AI Budget Advisor / Savings Optimizer
// advice feed. Pure functions over local data.
import { sumCents, type Cents } from "../money.js";
import { detectRecurring, normalizeMerchant, type RecurringOverride } from "../recurring/engine.js";
import { LIABILITY_ACCOUNT_TYPES, type Account, type Category, type ScheduledCharge, type Transaction } from "../types.js";

const DAY = 86_400_000;
const parseIso = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};
const toIso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export interface ForecastPoint {
  date: string;
  balance: Cents;
}

export interface IncomeStream {
  merchant: string;
  typicalAmount: Cents;
  /** Median days between paychecks. */
  intervalDays: number;
  nextDate: string;
}

export interface IncomePacing {
  nextPayday: string | null;
  daysUntilPayday: number | null;
  /** Bills due before the next payday. */
  billsBeforePayday: Cents;
  /** What's left per day until payday after bills and a safety buffer. */
  dailyAllowance: Cents | null;
}

export interface SinkingFund {
  merchant: string;
  icon: string;
  color: string;
  annualAmount: Cents;
  monthlySetAside: Cents;
  nextDue: string;
}

export interface SneakyExpense {
  merchant: string;
  icon: string;
  color: string;
  earlierAmount: Cents;
  latestAmount: Cents;
  increasePct: number;
  monthlyImpact: Cents;
}

export interface Advice {
  id: string;
  kind: "advisor" | "optimizer";
  icon: string;
  title: string;
  body: string;
  /** Estimated monthly impact when applicable. */
  impactMonthly?: Cents;
}

export interface ForecastSummary {
  /** Daily projected liquid balance. */
  points: ForecastPoint[];
  startBalance: Cents;
  endBalance: Cents;
  minBalance: Cents;
  minDate: string;
  /** First projected day the balance dips below zero, if any. */
  shortfallDate: string | null;
  horizonDays: number;
  dailyDiscretionary: Cents;
  incomeStreams: IncomeStream[];
  pacing: IncomePacing;
  sinkingFunds: SinkingFund[];
  sneaky: SneakyExpense[];
  advice: Advice[];
  /** Savings rate over the last 3 months, 0..1 (income kept). */
  savingsRate: number | null;
}

export interface ForecastInput {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  now?: Date;
  horizonDays?: number;
  recurringOverrides?: RecurringOverride[];
  /** User-scheduled charges (exact dates). Explicit schedules beat detection. */
  scheduled?: ScheduledCharge[];
}

/** Days between occurrences for a repeating scheduled charge. */
function scheduledIntervalDays(s: ScheduledCharge): number {
  if (s.type === "custom") return Math.max(1, s.intervalDays ?? 30);
  switch (s.cadence) {
    case "weekly": return 7;
    case "biweekly": return 14;
    case "yearly": return 365;
    default: return 30; // monthly
  }
}

/** Concrete occurrence dates (ms) for a scheduled charge inside [fromMs, toMs]. */
function scheduledOccurrences(s: ScheduledCharge, fromMs: number, toMs: number): number[] {
  const endMs = s.endDate ? parseIso(s.endDate) : Number.POSITIVE_INFINITY;
  let ms = parseIso(s.nextDate);
  if (s.type === "once") {
    return ms >= fromMs && ms <= toMs && ms <= endMs ? [ms] : [];
  }
  const out: number[] = [];
  let guard = 0;
  while (ms <= toMs && ms <= endMs && guard++ < 400) {
    if (ms >= fromMs) out.push(ms);
    if (s.type === "recurring" && s.cadence === "monthly") {
      const d = new Date(ms);
      ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    } else if (s.type === "recurring" && s.cadence === "yearly") {
      const d = new Date(ms);
      ms = Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate());
    } else {
      ms += scheduledIntervalDays(s) * DAY;
    }
  }
  return out;
}

export function buildForecast(input: ForecastInput): ForecastSummary {
  const { transactions, categories, accounts } = input;
  const now = input.now ?? new Date();
  const horizonDays = input.horizonDays ?? 90;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const active = transactions.filter((t) => !t.excluded);

  const startBalance = sumCents(
    accounts.filter((a) => !a.archived && !LIABILITY_ACCOUNT_TYPES.has(a.type)).map((a) => a.balance),
  );

  /* ---- recurring bills (reuse the detector) ---- */
  const recurring = detectRecurring({ transactions, categories, now, upcomingDays: horizonDays, overrides: input.recurringOverrides });

  /* ---- income streams: repeating income by payer ---- */
  const incomeGroups = new Map<string, Transaction[]>();
  for (const t of active) {
    if (t.type !== "income" || !t.merchant.trim()) continue;
    const key = normalizeMerchant(t.merchant);
    if (!key) continue;
    (incomeGroups.get(key) ?? incomeGroups.set(key, []).get(key)!).push(t);
  }
  const incomeStreams: IncomeStream[] = [];
  for (const txns of incomeGroups.values()) {
    if (txns.length < 2) continue;
    const sorted = [...txns].sort((a, b) => (a.date < b.date ? -1 : 1));
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) gaps.push((parseIso(sorted[i]!.date) - parseIso(sorted[i - 1]!.date)) / DAY);
    const gap = Math.round(median(gaps));
    if (gap < 5 || gap > 40) continue; // weekly..monthly pay cycles
    const last = sorted[sorted.length - 1]!;
    let nextMs = parseIso(last.date) + gap * DAY;
    while (nextMs < today) nextMs += gap * DAY;
    incomeStreams.push({
      merchant: last.merchant,
      typicalAmount: Math.round(median(sorted.map((t) => t.amount))),
      intervalDays: gap,
      nextDate: toIso(nextMs),
    });
  }
  incomeStreams.sort((a, b) => b.typicalAmount - a.typicalAmount);

  /* ---- user-scheduled charges: explicit dates beat detection ---- */
  const scheduled = (input.scheduled ?? []).filter((s) => s.active && s.amount > 0);
  const scheduledNames = new Set(scheduled.map((s) => normalizeMerchant(s.name)));
  // A detected stream that duplicates an explicit schedule is dropped — the
  // schedule is what the user *said* happens, so it wins.
  const detectedIncomeStreams = incomeStreams.filter((s) => !scheduledNames.has(normalizeMerchant(s.merchant)));
  incomeStreams.length = 0;
  incomeStreams.push(...detectedIncomeStreams);

  /* ---- daily discretionary: median spend/day excluding recurring payees ---- */
  const recurringKeys = new Set(recurring.items.map((i) => i.key));
  const windowStart = today - 60 * DAY;
  const dailySpend = new Map<string, number>();
  for (const t of active) {
    if (t.type !== "expense") continue;
    const ms = parseIso(t.date);
    if (ms < windowStart || ms > today) continue;
    if (recurringKeys.has(normalizeMerchant(t.merchant))) continue;
    dailySpend.set(t.date, (dailySpend.get(t.date) ?? 0) + t.amount);
  }
  const spentDays = [...dailySpend.values()];
  // average over the whole window (quiet days count as zero)
  const dailyDiscretionary = Math.round(sumCents(spentDays as Cents[]) / 60);

  /* ---- projection ---- */
  const billOn = new Map<string, Cents>();
  for (const u of recurring.upcoming) {
    if (scheduledNames.has(normalizeMerchant(u.merchant))) continue; // schedule wins
    billOn.set(u.date, (billOn.get(u.date) ?? 0) + u.amount);
  }
  const incomeOn = new Map<string, Cents>();
  for (const s of incomeStreams) {
    let ms = parseIso(s.nextDate);
    while (ms <= today + horizonDays * DAY) {
      const iso = toIso(ms);
      incomeOn.set(iso, (incomeOn.get(iso) ?? 0) + s.typicalAmount);
      ms += s.intervalDays * DAY;
    }
  }
  // explicit scheduled occurrences land on their exact dates
  for (const s of scheduled) {
    const target = s.direction === "income" ? incomeOn : billOn;
    for (const ms of scheduledOccurrences(s, today + DAY, today + horizonDays * DAY)) {
      const iso = toIso(ms);
      target.set(iso, (target.get(iso) ?? 0) + s.amount);
    }
  }
  // repeating scheduled income also counts as an income stream (pacing/payday)
  for (const s of scheduled) {
    if (s.direction !== "income" || s.type === "once") continue;
    incomeStreams.push({
      merchant: s.name,
      typicalAmount: s.amount,
      intervalDays: scheduledIntervalDays(s),
      nextDate: s.nextDate,
    });
  }
  incomeStreams.sort((a, b) => b.typicalAmount - a.typicalAmount);
  const points: ForecastPoint[] = [];
  let bal = startBalance;
  let minBalance = startBalance;
  let minDate = toIso(today);
  let shortfallDate: string | null = null;
  for (let d = 0; d <= horizonDays; d++) {
    const iso = toIso(today + d * DAY);
    if (d > 0) {
      bal += incomeOn.get(iso) ?? 0;
      bal -= billOn.get(iso) ?? 0;
      bal -= dailyDiscretionary;
    }
    if (bal < minBalance) {
      minBalance = bal;
      minDate = iso;
    }
    if (bal < 0 && !shortfallDate) shortfallDate = iso;
    points.push({ date: iso, balance: bal });
  }

  /* ---- income pacing: allowance until next payday ---- */
  const nextPaydayMs = incomeStreams.length
    ? Math.min(...incomeStreams.map((s) => parseIso(s.nextDate)))
    : null;
  let pacing: IncomePacing = { nextPayday: null, daysUntilPayday: null, billsBeforePayday: 0, dailyAllowance: null };
  if (nextPaydayMs !== null && nextPaydayMs > today) {
    const daysUntil = Math.round((nextPaydayMs - today) / DAY);
    // billOn already merges detected bills + explicit scheduled charges
    const billsBefore = sumCents(
      [...billOn.entries()].filter(([iso]) => parseIso(iso) < nextPaydayMs).map(([, amt]) => amt),
    );
    const buffer = Math.min(Math.round(startBalance * 0.1), 20_000); // keep 10% (max $200) aside
    const allowance = Math.max(0, Math.floor((startBalance - billsBefore - buffer) / Math.max(1, daysUntil)));
    pacing = { nextPayday: toIso(nextPaydayMs), daysUntilPayday: daysUntil, billsBeforePayday: billsBefore, dailyAllowance: allowance };
  }

  /* ---- sinking funds: spread annual bills across the year ---- */
  const sinkingFunds: SinkingFund[] = recurring.items
    .filter((i) => i.cadence === "yearly")
    .map((i) => ({
      merchant: i.merchant,
      icon: i.icon,
      color: i.color,
      annualAmount: i.typicalAmount,
      monthlySetAside: Math.ceil(i.typicalAmount / 12),
      nextDue: i.nextDate,
    }))
    .sort((a, b) => b.annualAmount - a.annualAmount);

  /* ---- sneaky expenses: recurring bills that crept up ---- */
  const sneaky: SneakyExpense[] = [];
  const byKey = new Map<string, Transaction[]>();
  for (const t of active) {
    if (t.type !== "expense" || !t.merchant.trim()) continue;
    const key = normalizeMerchant(t.merchant);
    if (!recurringKeys.has(key)) continue;
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(t);
  }
  for (const item of recurring.items) {
    const txns = (byKey.get(item.key) ?? []).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (txns.length < 4) continue;
    const half = Math.floor(txns.length / 2);
    const earlier = Math.round(median(txns.slice(0, half).map((t) => t.amount)));
    const latest = Math.round(median(txns.slice(half).map((t) => t.amount)));
    if (earlier <= 0) continue;
    const increasePct = (latest - earlier) / earlier;
    if (increasePct >= 0.05 && latest - earlier >= 100) {
      sneaky.push({
        merchant: item.merchant,
        icon: item.icon,
        color: item.color,
        earlierAmount: earlier,
        latestAmount: latest,
        increasePct: Math.round(increasePct * 100) / 100,
        monthlyImpact: item.cadence === "yearly" ? Math.round((latest - earlier) / 12) : latest - earlier,
      });
    }
  }
  sneaky.sort((a, b) => b.monthlyImpact - a.monthlyImpact);

  /* ---- savings rate over the last 3 full months ---- */
  const threeMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1)).getTime();
  const monthStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  let incomeSum = 0;
  let expenseSum = 0;
  for (const t of active) {
    const ms = parseIso(t.date);
    if (ms < threeMonthsAgo || ms >= monthStartMs) continue;
    if (t.type === "income") incomeSum += t.amount;
    else if (t.type === "expense") expenseSum += t.amount;
  }
  const savingsRate = incomeSum > 0 ? Math.round(((incomeSum - expenseSum) / incomeSum) * 100) / 100 : null;

  /* ---- advisor / optimizer feed ---- */
  const advice: Advice[] = [];
  if (shortfallDate) {
    advice.push({
      id: "shortfall",
      kind: "advisor",
      icon: "⚠️",
      title: `Projected shortfall on ${shortfallDate}`,
      body: `At the current pace your liquid balance goes negative on ${shortfallDate}. Trim daily spending or move a bill to stay above zero.`,
    });
  }
  if (savingsRate !== null && savingsRate < 0.1) {
    advice.push({
      id: "savings-rate",
      kind: "advisor",
      icon: "🪙",
      title: savingsRate < 0 ? "Spending exceeds income" : `Savings rate is ${Math.round(savingsRate * 100)}%`,
      body:
        savingsRate < 0
          ? "Over the last 3 months you spent more than you earned. Start with the biggest category below and cap it with a budget."
          : "You're keeping less than 10% of income. Nudging this to 15–20% builds a real cushion — sinking funds below help smooth the big annual bills.",
    });
  }
  if (recurring.subscriptionMonthly > 0 && incomeSum > 0) {
    const share = recurring.subscriptionMonthly / (incomeSum / 3);
    if (share > 0.08) {
      advice.push({
        id: "subs-share",
        kind: "optimizer",
        icon: "✂️",
        title: `Subscriptions eat ${Math.round(share * 100)}% of income`,
        body: `You pay for ${recurring.subscriptionCount} subscriptions. Cancelling just the two smallest usually saves real money without hurting.`,
        impactMonthly: recurring.subscriptionMonthly,
      });
    }
  }
  for (const s of sneaky.slice(0, 2)) {
    advice.push({
      id: `sneaky-${normalizeMerchant(s.merchant)}`,
      kind: "optimizer",
      icon: "🕵️",
      title: `${s.merchant} crept up ${Math.round(s.increasePct * 100)}%`,
      body: `This bill rose without you changing anything. A quick call (or plan switch) usually restores the old price.`,
      impactMonthly: s.monthlyImpact,
    });
  }
  if (sinkingFunds.length > 0) {
    const total = sumCents(sinkingFunds.map((f) => f.monthlySetAside));
    advice.push({
      id: "sinking",
      kind: "advisor",
      icon: "🏦",
      title: "Smooth your annual bills",
      body: `Setting aside the monthly amounts below turns ${sinkingFunds.length} annual bill${sinkingFunds.length === 1 ? "" : "s"} into a non-event instead of a crisis.`,
      impactMonthly: total,
    });
  }
  if (pacing.dailyAllowance !== null && dailyDiscretionary > 0 && pacing.dailyAllowance < dailyDiscretionary) {
    advice.push({
      id: "pace",
      kind: "advisor",
      icon: "⏱️",
      title: "You're outpacing this pay period",
      body: `You typically spend ${(dailyDiscretionary / 100).toFixed(0)} a day but only ${(pacing.dailyAllowance / 100).toFixed(0)}/day is safe until payday. Slow down a little to land smoothly.`,
    });
  }

  return {
    points,
    startBalance,
    endBalance: bal,
    minBalance,
    minDate,
    shortfallDate,
    horizonDays,
    dailyDiscretionary,
    incomeStreams,
    pacing,
    sinkingFunds,
    sneaky,
    advice,
    savingsRate,
  };
}
