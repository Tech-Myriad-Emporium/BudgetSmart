// Master overview: this device computes a compact snapshot of the signed-in
// user's finances and pushes it to the central API, where the plan owner's
// Master tab aggregates every member's snapshot. Only headline numbers are
// shared — never transactions, merchants or notes.
import { LIABILITY_ACCOUNT_TYPES, buildPortfolio, sumCents, type AccountType } from "@budgetsmart/shared";
import { accounts, budgets, categories, centralLink, debts, goals, holdings, transactions, users } from "../../db/repo.js";
import { computeBalancesForUser } from "../../lib/balances.js";
import { serializeAccount, serializeHolding, serializeTransaction } from "../../lib/serialize.js";
import { env } from "../../env.js";

export interface LocalSnapshot {
  netWorth: number;
  assets: number;
  liabilities: number;
  liquid: number;
  income30: number;
  expenses30: number;
  debtTotal: number;
  investTotal: number;
  budgetCount: number;
  budgetOverCount: number;
  goalCount: number;
  goalAvgPct: number;
  topCategories: Array<{ name: string; icon: string; amount: number }>;
}

export function buildLocalSnapshot(userId: string): LocalSnapshot {
  const balances = computeBalancesForUser(userId);
  const accountList = accounts
    .listByUser(userId, { activeOnly: true })
    .map((a) => serializeAccount(a, balances.get(a.id) ?? a.openingBalance));

  const assetAccounts = sumCents(accountList.filter((a) => !LIABILITY_ACCOUNT_TYPES.has(a.type as AccountType)).map((a) => a.balance));
  const liabilityAccounts = sumCents(accountList.filter((a) => LIABILITY_ACCOUNT_TYPES.has(a.type as AccountType)).map((a) => a.balance));
  const investTotal = buildPortfolio(holdings.listByUser(userId).map(serializeHolding)).totalValue;
  const debtTotal = sumCents(debts.listByUser(userId).map((d) => d.balance));
  const liquid = sumCents(accountList.filter((a) => a.type !== "credit" && a.type !== "loan").map((a) => a.balance));

  // last 30 days of cashflow + top spending categories
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const txns = transactions.allByUser(userId).map(serializeTransaction).filter((t) => t.date >= cutoff && !t.excluded && !t.pending);
  const income30 = sumCents(txns.filter((t) => t.type === "income").map((t) => t.amount));
  const expenses30 = sumCents(txns.filter((t) => t.type === "expense").map((t) => t.amount));

  const catById = new Map(categories.listByUser(userId).map((c) => [c.id, c]));
  const perCat = new Map<string, number>();
  for (const t of txns) {
    if (t.type !== "expense" || !t.categoryId) continue;
    perCat.set(t.categoryId, (perCat.get(t.categoryId) ?? 0) + t.amount);
  }
  const topCategories = [...perCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, amount]) => ({ name: catById.get(id)?.name ?? "Other", icon: catById.get(id)?.icon ?? "•", amount }));

  // budgets: this month's status (spent per budgeted category vs its limit)
  const month = new Date().toISOString().slice(0, 7);
  const monthBudgets = budgets.listByUserMonth(userId, month);
  const spentByCat = new Map<string, number>();
  for (const t of transactions.allByUser(userId).map(serializeTransaction)) {
    if (t.type !== "expense" || !t.categoryId || t.excluded || !t.date.startsWith(month)) continue;
    spentByCat.set(t.categoryId, (spentByCat.get(t.categoryId) ?? 0) + t.amount);
  }
  const budgetOverCount = monthBudgets.filter((b) => (spentByCat.get(b.categoryId) ?? 0) > b.limit).length;

  const goalList = goals.listByUser(userId);
  const goalAvgPct =
    goalList.length === 0
      ? 0
      : Math.round(
          (goalList.reduce((s, g) => s + Math.min(1, g.targetAmount > 0 ? g.currentAmount / g.targetAmount : 0), 0) /
            goalList.length) * 100,
        );

  return {
    netWorth: assetAccounts + investTotal - liabilityAccounts - debtTotal,
    assets: assetAccounts + investTotal,
    liabilities: liabilityAccounts + debtTotal,
    liquid,
    income30,
    expenses30,
    debtTotal,
    investTotal,
    budgetCount: monthBudgets.length,
    budgetOverCount,
    goalCount: goalList.length,
    goalAvgPct,
    topCategories,
  };
}

/** Push this user's snapshot to the central API (no-op when not linked or
 *  not sharing a plan — the API rejects those quietly). */
export async function pushSnapshot(userId: string): Promise<boolean> {
  const link = centralLink.get(userId);
  if (!link) return false;
  try {
    const res = await fetch(`${env.centralApiUrl}/family/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${link.token}` },
      body: JSON.stringify(buildLocalSnapshot(userId)),
      signal: AbortSignal.timeout(15000),
    });
    return res.ok;
  } catch {
    return false; // offline — next pass catches it
  }
}

/** Owner side: read every member's snapshot from the central API. */
export async function fetchOverview(userId: string): Promise<{ status: number; body: unknown }> {
  const link = centralLink.get(userId);
  if (!link) return { status: 400, body: { error: "Connect your BudgetSmart account first (Plans page)." } };
  try {
    const res = await fetch(`${env.centralApiUrl}/family/overview`, {
      headers: { Authorization: `Bearer ${link.token}` },
      signal: AbortSignal.timeout(15000),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } catch {
    return { status: 502, body: { error: "Couldn't reach the sync service — are you online?" } };
  }
}

/** Snapshots push 30s after boot, then every 6 hours. */
export function startMasterSync(): void {
  const pass = async () => {
    for (const u of users.listAll()) {
      await pushSnapshot(u.id).catch(() => {});
    }
  };
  setTimeout(() => void pass(), 30_000);
  setInterval(() => void pass(), 6 * 60 * 60 * 1000);
}
