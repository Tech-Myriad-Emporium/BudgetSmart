import { clamp, sumCents, type Cents } from "../money.js";
import {
  LIABILITY_ACCOUNT_TYPES,
  type Account,
  type Budget,
  type BudgetLine,
  type BudgetSummary,
  type Category,
  type CategorySpend,
  type RolloverMode,
  type SafeToSpend,
  type Transaction,
} from "../types.js";
import { monthOf, previousMonth, type Month } from "./period.js";

/* ------------------------------------------------------------------ *
 * Transaction effects
 * ------------------------------------------------------------------ */

/**
 * Signed effect of a transaction on its *source* account balance, in cents.
 * income: +amount, expense: -amount, transfer: -amount (leaves source).
 */
export function accountEffect(tx: Pick<Transaction, "type" | "amount">): Cents {
  switch (tx.type) {
    case "income":
      return tx.amount;
    case "expense":
    case "transfer":
      return -tx.amount;
  }
}

/**
 * Compute the live balance of an account from its opening balance + posted txns.
 *
 * Sign convention:
 *  - Asset accounts (cash/checking/savings): balance is money you have (positive).
 *  - Liability accounts (credit/loan): balance is the amount you OWE (positive),
 *    `openingBalance` is the starting amount owed, charging an expense to it
 *    increases what you owe, and paying it (a transfer in) decreases it.
 */
export function computeAccountBalance(account: Account, transactions: Transaction[]): Cents {
  const liability = LIABILITY_ACCOUNT_TYPES.has(account.type);
  const sign = liability ? -1 : 1; // liabilities accrue in the opposite direction
  let balance = account.openingBalance;
  for (const tx of transactions) {
    if (tx.pending) continue;
    if (tx.accountId === account.id) balance += sign * accountEffect(tx);
    if (tx.type === "transfer" && tx.transferAccountId === account.id) {
      balance += sign * tx.amount; // incoming side of a transfer
    }
  }
  return balance;
}

/** Only expense transactions that count toward budgets/trends. */
export function isBudgetableExpense(tx: Transaction): boolean {
  return tx.type === "expense" && !tx.excluded && !tx.pending && tx.categoryId != null;
}

/* ------------------------------------------------------------------ *
 * Rollover
 * ------------------------------------------------------------------ */

/**
 * Apply a category's rollover policy to last month's leftover (limit - spent).
 *  - none:     nothing carries over
 *  - positive: only unspent surplus carries (never debt)
 *  - full:     surplus and overspend both carry
 */
export function applyRollover(mode: RolloverMode, priorRemaining: Cents): Cents {
  switch (mode) {
    case "none":
      return 0;
    case "positive":
      return Math.max(0, priorRemaining);
    case "full":
      return priorRemaining;
  }
}

/* ------------------------------------------------------------------ *
 * Spend aggregation
 * ------------------------------------------------------------------ */

/** Sum of budgetable expense spend per categoryId within a single month. */
export function spendByCategory(transactions: Transaction[], month: Month): Map<string, Cents> {
  const out = new Map<string, Cents>();
  for (const tx of transactions) {
    if (!isBudgetableExpense(tx)) continue;
    if (monthOf(tx.date) !== month) continue;
    const key = tx.categoryId as string;
    out.set(key, (out.get(key) ?? 0) + tx.amount);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Budget summary (the heart of the budgets screen)
 * ------------------------------------------------------------------ */

export interface BuildBudgetSummaryInput {
  month: Month;
  categories: Category[];
  /** Budgets for `month`. */
  budgets: Budget[];
  /** Budgets for the previous month (to seed rollover). */
  priorBudgets: Budget[];
  /** All transactions (the engine filters by month internally). */
  transactions: Transaction[];
}

export function buildBudgetSummary(input: BuildBudgetSummaryInput): BudgetSummary {
  const { month, categories, budgets, priorBudgets, transactions } = input;

  const thisSpend = spendByCategory(transactions, month);
  const priorSpend = spendByCategory(transactions, previousMonth(month));
  const limitFor = (list: Budget[], categoryId: string): Cents =>
    list.find((b) => b.categoryId === categoryId)?.limit ?? 0;

  const lines: BudgetLine[] = categories
    .filter((c) => c.kind === "expense" && !c.hidden)
    .map((c) => {
      const limit = limitFor(budgets, c.id);
      const priorLimit = limitFor(priorBudgets, c.id);
      const priorRemaining = priorLimit - (priorSpend.get(c.id) ?? 0);
      const rolledOver = priorLimit > 0 ? applyRollover(c.rollover, priorRemaining) : 0;
      const available = limit + rolledOver;
      const spent = thisSpend.get(c.id) ?? 0;
      const remaining = available - spent;
      const progress = available > 0 ? clamp(spent / available, 0, 1) : spent > 0 ? 1 : 0;
      return {
        categoryId: c.id,
        categoryName: c.name,
        icon: c.icon,
        color: c.color,
        rollover: c.rollover,
        limit,
        rolledOver,
        available,
        spent,
        remaining,
        progress,
        overspent: remaining < 0,
      };
    })
    // show funded categories and any with spend first; keep funded ones even at 0 spend
    .filter((l) => l.limit > 0 || l.spent > 0 || l.rolledOver !== 0);

  const totalLimit = sumCents(lines.map((l) => l.limit));
  const totalSpent = sumCents(lines.map((l) => l.spent));
  const totalRemaining = sumCents(lines.map((l) => l.remaining));

  return { month, totalLimit, totalSpent, totalRemaining, lines };
}

/* ------------------------------------------------------------------ *
 * Safe-to-spend
 * ------------------------------------------------------------------ */

export interface SafeToSpendInput {
  accounts: Account[];
  /** Live balances keyed by accountId (already computed). */
  balances: Map<string, Cents>;
  budgetSummary: BudgetSummary;
  expectedIncome?: Cents;
}

/**
 * Safe-to-spend = liquid cash, minus money already committed to remaining
 * (positive) budgets, plus any income still expected this period.
 */
export function computeSafeToSpend(input: SafeToSpendInput): SafeToSpend {
  const { accounts, balances, budgetSummary, expectedIncome = 0 } = input;

  const liquid = sumCents(
    accounts
      .filter((a) => !a.archived && !LIABILITY_ACCOUNT_TYPES.has(a.type))
      .map((a) => balances.get(a.id) ?? 0),
  );

  const budgetedRemaining = sumCents(
    budgetSummary.lines.map((l) => Math.max(0, l.remaining)),
  );

  const amount = liquid - budgetedRemaining + expectedIncome;

  return { liquid, budgetedRemaining, expectedIncome, amount };
}

/* ------------------------------------------------------------------ *
 * Spend breakdown for charts
 * ------------------------------------------------------------------ */

export function categorySpendBreakdown(
  categories: Category[],
  transactions: Transaction[],
  month: Month,
): CategorySpend[] {
  const spend = spendByCategory(transactions, month);
  const total = sumCents([...spend.values()]);
  const byId = new Map(categories.map((c) => [c.id, c]));

  return [...spend.entries()]
    .map(([categoryId, spent]) => {
      const c = byId.get(categoryId);
      return {
        categoryId,
        categoryName: c?.name ?? "Uncategorized",
        icon: c?.icon ?? "❓",
        color: c?.color ?? "#5A5A5A",
        spent,
        share: total > 0 ? spent / total : 0,
      };
    })
    .sort((a, b) => b.spent - a.spent);
}
