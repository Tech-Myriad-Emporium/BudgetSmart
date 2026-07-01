// Minimal response shapes for the scaffold. On a full build this app should
// consume @budgetsmart/shared (same engines as web) via the copy mechanism.

export interface DashboardData {
  month: string;
  safeToSpend: { amount: number };
  netWorth: { assets: number; liabilities: number; total: number };
  cashflow: { income: number; expenses: number; net: number };
  recentTransactions: Array<{
    id: string;
    merchant: string;
    amount: number;
    type: string;
    date: string;
  }>;
}

/** Money is integer cents everywhere (matches the backend). */
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
