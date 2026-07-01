import { ACCOUNT_TYPE_LABELS } from "@budgetsmart/shared";
import { Link } from "react-router-dom";
import { CashflowBars, SpendDonut } from "../../components/charts";
import { EmptyState, Money, Spinner } from "../../components/ui";
import { useDashboard } from "../../lib/hooks";
import { formatDateRelative, formatMonthLong } from "../../lib/format";

export function DashboardPage() {
  const { data, isLoading, isError } = useDashboard();

  if (isLoading) return <div className="page"><Spinner label="Loading your finances…" /></div>;
  if (isError || !data) return <div className="page"><EmptyState title="Could not load dashboard" /></div>;

  const { safeToSpend, netWorth, cashflow, budgetSummary, spendBreakdown, recentTransactions, accounts } = data;
  const stsTone = safeToSpend.amount >= 0 ? "accent" : "danger";

  return (
    <div className="page">
      {/* headline stats */}
      <div className="grid grid-3">
        <div className="card interactive">
          <div className="row between">
            <span className="card-title">Safe to spend</span>
            <span className="badge accent">NOW</span>
          </div>
          <div className={`stat stat-xl ${stsTone}`} style={{ marginTop: 10 }}>
            <Money cents={safeToSpend.amount} />
          </div>
          <div className="faint text-xs" style={{ marginTop: 8 }}>
            {formatMoneyInline(safeToSpend.liquid)} liquid − {formatMoneyInline(safeToSpend.budgetedRemaining)} reserved
          </div>
        </div>

        <div className="card interactive">
          <span className="card-title">Net worth</span>
          <div className="stat stat-xl" style={{ marginTop: 10 }}>
            <Money cents={netWorth.total} colorize />
          </div>
          <div className="row gap-sm faint text-xs" style={{ marginTop: 8 }}>
            <span className="accent">▲ {formatMoneyInline(netWorth.assets)}</span>
            <span className="danger">▼ {formatMoneyInline(netWorth.liabilities)}</span>
          </div>
        </div>

        <div className="card interactive">
          <span className="card-title">This month · net</span>
          <div className="stat stat-xl" style={{ marginTop: 10 }}>
            <Money cents={cashflow.net} colorize signed />
          </div>
          <div className="faint text-xs" style={{ marginTop: 8 }}>
            {formatMonthLong(data.month)}
          </div>
        </div>
      </div>

      <div className="grid grid-dash">
        {/* left column */}
        <div className="col gap-lg">
          <div className="card">
            <div className="row between" style={{ marginBottom: 16 }}>
              <span className="card-title">Spending by category</span>
              <Link to="/transactions" className="badge">View all →</Link>
            </div>
            <SpendDonut data={spendBreakdown} total={budgetSummary.totalSpent} />
          </div>

          <div className="card">
            <div className="row between" style={{ marginBottom: 16 }}>
              <span className="card-title">Recent activity</span>
              <Link to="/transactions" className="badge">All →</Link>
            </div>
            {recentTransactions.length === 0 ? (
              <EmptyState title="No transactions yet" hint="Add one from the Transactions tab." />
            ) : (
              <div className="ledger">
                {recentTransactions.map((t) => {
                  const sign = t.type === "income" ? 1 : t.type === "transfer" ? 0 : -1;
                  return (
                    <div className="ledger-row" key={t.id}>
                      <span className="cat-icon">{t.type === "transfer" ? "⇄" : t.tags.includes("subscription") ? "♻" : "•"}</span>
                      <div className="col" style={{ minWidth: 0 }}>
                        <span className="text-sm truncate">{t.merchant || "(no merchant)"}</span>
                        <span className="faint text-xs">
                          {formatDateRelative(t.date)}
                          {t.pending ? " · pending" : ""}
                        </span>
                      </div>
                      <span className={`stat text-sm ${sign > 0 ? "amount-pos" : ""}`}>
                        {sign === 0 ? "" : sign > 0 ? "+" : "−"}
                        <Money cents={t.amount} />
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* right column */}
        <div className="col gap-lg">
          <div className="card">
            <span className="card-title">Cashflow</span>
            <div style={{ marginTop: 16 }}>
              <CashflowBars income={cashflow.income} expenses={cashflow.expenses} />
            </div>
          </div>

          <div className="card">
            <div className="row between" style={{ marginBottom: 14 }}>
              <span className="card-title">Accounts</span>
              <Link to="/accounts" className="badge">Manage →</Link>
            </div>
            <div className="col gap-sm">
              {accounts.map((a) => (
                <div className="row between" key={a.id}>
                  <div className="col" style={{ minWidth: 0 }}>
                    <span className="text-sm truncate">{a.name}</span>
                    <span className="faint text-xs">{ACCOUNT_TYPE_LABELS[a.type]}</span>
                  </div>
                  <Money cents={a.balance} colorize className="text-sm" />
                </div>
              ))}
              {accounts.length === 0 && <span className="faint text-sm">No accounts yet.</span>}
            </div>
          </div>

          <div className="card">
            <div className="row between" style={{ marginBottom: 14 }}>
              <span className="card-title">Top budgets</span>
              <Link to="/budgets" className="badge">Open →</Link>
            </div>
            <div className="col gap-lg">
              {budgetSummary.lines
                .filter((l) => l.limit > 0)
                .slice(0, 4)
                .map((l) => {
                  const pct = Math.round(l.progress * 100);
                  const cls = l.overspent ? "over" : l.progress > 0.85 ? "warn" : "";
                  return (
                    <div className="col gap-sm" key={l.categoryId}>
                      <div className="row between">
                        <span className="text-sm">
                          {l.icon} {l.categoryName}
                        </span>
                        <span className="num text-xs faint">{pct}%</span>
                      </div>
                      <div className={`progress ${cls}`}>
                        <span style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              {budgetSummary.lines.filter((l) => l.limit > 0).length === 0 && (
                <span className="faint text-sm">No budgets set yet.</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// tiny local helper to keep inline strings compact
function formatMoneyInline(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
