// Monthly email digest: a compact, structured summary of one month computed
// locally (the email itself is rendered and sent by the central API — only
// these numbers leave the device, and only when the user opts in).
import { sumCents, type Cents } from "../money.js";
import { detectRecurring, type RecurringOverride } from "../recurring/engine.js";
import { LIABILITY_ACCOUNT_TYPES, type Account, type Budget, type Category, type Transaction } from "../types.js";

export interface DigestCategory {
  name: string;
  icon: string;
  amount: Cents;
}

export interface MonthlyDigest {
  /** The month summarized, YYYY-MM. */
  month: string;
  income: Cents;
  expenses: Cents;
  net: Cents;
  txCount: number;
  /** Previous month's expenses for the delta line (null if no data). */
  prevExpenses: Cents | null;
  /** Expense change vs the previous month, e.g. 0.12 = +12% (null if no data). */
  expenseDeltaPct: number | null;
  topCategories: DigestCategory[];
  /** Budget performance for the month (null if no budgets were set). */
  budgets: { count: number; overCount: number; totalLimit: Cents; totalSpent: Cents } | null;
  subscriptionCount: number;
  subscriptionMonthly: Cents;
  /** Liquid balance across non-liability accounts at generation time. */
  liquidBalance: Cents;
}

export interface DigestInput {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  /** Budgets belonging to `month`. */
  budgets: Budget[];
  /** YYYY-MM to summarize (typically the last full month). */
  month: string;
  recurringOverrides?: RecurringOverride[];
}

const prevMonthOf = (month: string): string => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
};

export function buildMonthlyDigest(input: DigestInput): MonthlyDigest {
  const { transactions, categories, accounts, budgets, month } = input;
  const active = transactions.filter((t) => !t.excluded);
  const catById = new Map(categories.map((c) => [c.id, c]));
  const inMonth = active.filter((t) => t.date.startsWith(month));
  const prevMonth = prevMonthOf(month);
  const inPrev = active.filter((t) => t.date.startsWith(prevMonth));

  const income = sumCents(inMonth.filter((t) => t.type === "income").map((t) => t.amount));
  const expenses = sumCents(inMonth.filter((t) => t.type === "expense").map((t) => t.amount));
  const prevExpenses = inPrev.length > 0 ? sumCents(inPrev.filter((t) => t.type === "expense").map((t) => t.amount)) : null;

  const byCat = new Map<string, number>();
  for (const t of inMonth) {
    if (t.type !== "expense") continue;
    const key = t.categoryId ?? "__none";
    byCat.set(key, (byCat.get(key) ?? 0) + t.amount);
  }
  const topCategories: DigestCategory[] = [...byCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, amount]) => {
      const cat = id === "__none" ? undefined : catById.get(id);
      return { name: cat?.name ?? "Uncategorized", icon: cat?.icon ?? "◦", amount };
    });

  let budgetStats: MonthlyDigest["budgets"] = null;
  if (budgets.length > 0) {
    const spentFor = (categoryId: string) =>
      sumCents(inMonth.filter((t) => t.type === "expense" && t.categoryId === categoryId).map((t) => t.amount));
    const totalLimit = sumCents(budgets.map((b) => b.limit));
    let totalSpent = 0;
    let overCount = 0;
    for (const b of budgets) {
      const spent = spentFor(b.categoryId);
      totalSpent += spent;
      if (spent > b.limit) overCount++;
    }
    budgetStats = { count: budgets.length, overCount, totalLimit, totalSpent };
  }

  const recurring = detectRecurring({ transactions, categories, overrides: input.recurringOverrides });

  return {
    month,
    income,
    expenses,
    net: income - expenses,
    txCount: inMonth.length,
    prevExpenses,
    expenseDeltaPct:
      prevExpenses !== null && prevExpenses > 0 ? Math.round(((expenses - prevExpenses) / prevExpenses) * 100) / 100 : null,
    topCategories,
    budgets: budgetStats,
    subscriptionCount: recurring.subscriptionCount,
    subscriptionMonthly: recurring.subscriptionMonthly,
    liquidBalance: sumCents(accounts.filter((a) => !a.archived && !LIABILITY_ACCOUNT_TYPES.has(a.type)).map((a) => a.balance)),
  };
}
