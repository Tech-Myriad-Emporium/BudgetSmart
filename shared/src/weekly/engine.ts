// Weekly financial report: a 7-day window summary (in-app "this week" and
// the emailed last-completed-week recap) computed locally.
import { sumCents, type Cents } from "../money.js";
import { detectRecurring, type RecurringOverride } from "../recurring/engine.js";
import type { Budget, Category, Transaction } from "../types.js";

const DAY = 86_400_000;
const parseIso = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};
const toIso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export interface WeeklyReport {
  /** Inclusive ISO dates of the 7-day window. */
  weekStart: string;
  weekEnd: string;
  spending: Cents;
  income: Cents;
  net: Cents;
  txCount: number;
  /** Previous 7-day window's spending (null if empty). */
  prevSpending: Cents | null;
  spendingDeltaPct: number | null;
  topCategories: Array<{ name: string; icon: string; amount: Cents }>;
  biggestPurchase: { merchant: string; amount: Cents; date: string } | null;
  /** Bills expected in the 7 days after the window. */
  upcomingBills: Array<{ merchant: string; icon: string; amount: Cents; date: string }>;
  /** Month budget pace at the window end (null when no budgets). */
  budgetPace: { pctUsed: number; pctElapsed: number } | null;
}

export interface WeeklyInput {
  transactions: Transaction[];
  categories: Category[];
  /** Budgets for the month containing `weekEnd`. */
  budgets: Budget[];
  /** Last day of the report window (defaults to today). */
  end?: Date;
  recurringOverrides?: RecurringOverride[];
}

/** Monday of the week containing `d` (UTC). */
export function weekStartOf(d: Date): string {
  const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = new Date(ms).getUTCDay(); // 0 Sun..6 Sat
  return toIso(ms - ((dow + 6) % 7) * DAY);
}

export function buildWeeklyReport(input: WeeklyInput): WeeklyReport {
  const { transactions, categories, budgets } = input;
  const end = input.end ?? new Date();
  const endMs = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const startMs = endMs - 6 * DAY;
  const weekStart = toIso(startMs);
  const weekEnd = toIso(endMs);
  const active = transactions.filter((t) => !t.excluded);
  const catById = new Map(categories.map((c) => [c.id, c]));

  const inWindow = (t: Transaction, s: number, e: number) => {
    const ms = parseIso(t.date);
    return ms >= s && ms <= e;
  };
  const week = active.filter((t) => inWindow(t, startMs, endMs));
  const prevWeek = active.filter((t) => inWindow(t, startMs - 7 * DAY, endMs - 7 * DAY));

  const spending = sumCents(week.filter((t) => t.type === "expense").map((t) => t.amount));
  const income = sumCents(week.filter((t) => t.type === "income").map((t) => t.amount));
  const prevSpending = prevWeek.length > 0 ? sumCents(prevWeek.filter((t) => t.type === "expense").map((t) => t.amount)) : null;

  const byCat = new Map<string, number>();
  let biggest: WeeklyReport["biggestPurchase"] = null;
  for (const t of week) {
    if (t.type !== "expense") continue;
    if (t.categoryId) byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amount);
    if (!biggest || t.amount > biggest.amount) biggest = { merchant: t.merchant, amount: t.amount, date: t.date };
  }
  const topCategories = [...byCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, amount]) => {
      const c = catById.get(id);
      return { name: c?.name ?? "Uncategorized", icon: c?.icon ?? "◦", amount };
    });

  // bills in the 7 days after the window
  const recurring = detectRecurring({
    transactions,
    categories,
    now: new Date(endMs),
    upcomingDays: 7,
    overrides: input.recurringOverrides,
  });
  const upcomingBills = recurring.upcoming.slice(0, 5).map((u) => ({ merchant: u.merchant, icon: u.icon, amount: u.amount, date: u.date }));

  // month budget pace at window end
  let budgetPace: WeeklyReport["budgetPace"] = null;
  if (budgets.length > 0) {
    const month = weekEnd.slice(0, 7);
    const totalLimit = sumCents(budgets.map((b) => b.limit));
    const spent = sumCents(
      active.filter((t) => t.type === "expense" && t.date.startsWith(month) && parseIso(t.date) <= endMs).map((t) => t.amount),
    );
    const endD = new Date(endMs);
    const daysInMonth = new Date(Date.UTC(endD.getUTCFullYear(), endD.getUTCMonth() + 1, 0)).getUTCDate();
    if (totalLimit > 0) {
      budgetPace = {
        pctUsed: Math.round((spent / totalLimit) * 100),
        pctElapsed: Math.round((endD.getUTCDate() / daysInMonth) * 100),
      };
    }
  }

  return {
    weekStart,
    weekEnd,
    spending,
    income,
    net: income - spending,
    txCount: week.length,
    prevSpending,
    spendingDeltaPct:
      prevSpending !== null && prevSpending > 0 ? Math.round(((spending - prevSpending) / prevSpending) * 100) / 100 : null,
    topCategories,
    biggestPurchase: biggest,
    upcomingBills,
    budgetPace,
  };
}
