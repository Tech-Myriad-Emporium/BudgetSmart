import { sumCents, type Cents } from "../money.js";
import type {
  Account,
  CashflowPoint,
  Category,
  CategorySpend,
  MerchantSpend,
  NetWorthPoint,
  ReportData,
  ReportSummary,
  Transaction,
} from "../types.js";
import { LIABILITY_ACCOUNT_TYPES } from "../types.js";
import { computeAccountBalance } from "../budgeting/engine.js";
import { currentMonth, monthOf, nextMonth, previousMonth, type Month } from "../budgeting/period.js";

/** The last `n` months (inclusive) ending at `end`, oldest first. */
export function monthsRange(n: number, end: Month = currentMonth()): Month[] {
  const out: Month[] = [end];
  for (let i = 1; i < Math.max(1, n); i++) out.unshift(previousMonth(out[0]!));
  return out;
}

const isSpend = (t: Transaction): boolean => t.type === "expense" && !t.excluded && !t.pending;
const isIncome = (t: Transaction): boolean => t.type === "income" && !t.excluded && !t.pending;

export function buildCashflow(transactions: Transaction[], months: Month[]): CashflowPoint[] {
  const inc = new Map<string, Cents>();
  const exp = new Map<string, Cents>();
  const within = new Set(months);
  for (const t of transactions) {
    const m = monthOf(t.date);
    if (!within.has(m)) continue;
    if (isIncome(t)) inc.set(m, (inc.get(m) ?? 0) + t.amount);
    else if (isSpend(t)) exp.set(m, (exp.get(m) ?? 0) + t.amount);
  }
  return months.map((month) => {
    const income = inc.get(month) ?? 0;
    const expense = exp.get(month) ?? 0;
    return { month, income, expense, net: income - expense };
  });
}

/** Net worth as of the end of each month (liability-aware). */
export function buildNetWorth(
  accounts: Account[],
  transactions: Transaction[],
  months: Month[],
): NetWorthPoint[] {
  const active = accounts.filter((a) => !a.archived);
  return months.map((month) => {
    const cutoff = `${nextMonth(month)}-01`; // exclusive: start of the following month
    const upTo = transactions.filter((t) => t.date < cutoff);
    let assets = 0;
    let liabilities = 0;
    for (const account of active) {
      const balance = computeAccountBalance(account, upTo);
      if (LIABILITY_ACCOUNT_TYPES.has(account.type)) liabilities += balance;
      else assets += balance;
    }
    return { month, assets, liabilities, net: assets - liabilities };
  });
}

export function buildTopMerchants(
  transactions: Transaction[],
  months: Month[],
  limit = 8,
): MerchantSpend[] {
  const within = new Set(months);
  const byMerchant = new Map<string, { total: Cents; count: number }>();
  for (const t of transactions) {
    if (!isSpend(t) || !within.has(monthOf(t.date))) continue;
    const key = t.merchant.trim() || "(no merchant)";
    const cur = byMerchant.get(key) ?? { total: 0, count: 0 };
    cur.total += t.amount;
    cur.count += 1;
    byMerchant.set(key, cur);
  }
  return [...byMerchant.entries()]
    .map(([merchant, v]) => ({ merchant, total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function buildCategoryBreakdown(
  categories: Category[],
  transactions: Transaction[],
  months: Month[],
): CategorySpend[] {
  const within = new Set(months);
  const spend = new Map<string | null, Cents>();
  for (const t of transactions) {
    if (!isSpend(t) || !within.has(monthOf(t.date))) continue;
    const key = t.categoryId;
    spend.set(key, (spend.get(key) ?? 0) + t.amount);
  }
  const total = sumCents([...spend.values()]);
  const byId = new Map(categories.map((c) => [c.id, c]));
  return [...spend.entries()]
    .map(([categoryId, amount]) => {
      const c = categoryId ? byId.get(categoryId) : undefined;
      return {
        categoryId: categoryId ?? null,
        categoryName: c?.name ?? "Uncategorized",
        icon: c?.icon ?? "❓",
        color: c?.color ?? "#5A5A5A",
        spent: amount,
        share: total > 0 ? amount / total : 0,
      };
    })
    .sort((a, b) => b.spent - a.spent);
}

export interface BuildReportInput {
  months: number;
  end?: Month;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
}

export function buildReport(input: BuildReportInput): ReportData {
  const months = monthsRange(input.months, input.end ?? currentMonth());
  const cashflow = buildCashflow(input.transactions, months);
  const netWorth = buildNetWorth(input.accounts, input.transactions, months);
  const categoryBreakdown = buildCategoryBreakdown(input.categories, input.transactions, months);
  const topMerchants = buildTopMerchants(input.transactions, months);

  const totalIncome = sumCents(cashflow.map((c) => c.income));
  const totalExpense = sumCents(cashflow.map((c) => c.expense));
  const summary: ReportSummary = {
    months: months.length,
    totalIncome,
    totalExpense,
    net: totalIncome - totalExpense,
    avgMonthlyExpense: months.length ? Math.round(totalExpense / months.length) : 0,
    savingsRate: totalIncome > 0 ? (totalIncome - totalExpense) / totalIncome : 0,
  };

  return { months, cashflow, netWorth, categoryBreakdown, topMerchants, summary };
}
