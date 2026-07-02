import { formatMoney, formatMoneyCompact, type CashflowPoint, type NetWorthPoint } from "@budgetsmart/shared";
import { useState } from "react";
import { SpendDonut } from "../../components/charts";
import { EmptyState, Money, Spinner } from "../../components/ui";
import { api } from "../../lib/api";
import { useReport, useWeeklyReport } from "../../lib/hooks";
import { formatDateShort, monthAbbr } from "../../lib/format";

/** "This week so far" — the 7-day window ending today, vs the week before. */
function WeeklyCard() {
  const weekQ = useWeeklyReport();
  const w = weekQ.data;
  if (!w) return null;
  const delta = w.spendingDeltaPct;
  return (
    <div className="card">
      <div className="row between wrap" style={{ gap: 12 }}>
        <div className="col">
          <span className="card-title">📅 This week ({formatDateShort(w.weekStart)} – {formatDateShort(w.weekEnd)})</span>
          <div className="row" style={{ gap: 24, marginTop: 10 }}>
            <span className="text-sm">out <Money cents={w.spending} className="text-sm danger" /></span>
            <span className="text-sm">in <Money cents={w.income} className="text-sm accent" /></span>
            <span className="text-sm">net <Money cents={w.net} colorize className="text-sm" /></span>
            {delta !== null && (
              <span className={`text-xs ${delta > 0 ? "warn" : "accent"}`} style={{ alignSelf: "center" }}>
                {delta > 0 ? "▲" : "▼"} {Math.abs(Math.round(delta * 100))}% vs last week
              </span>
            )}
          </div>
        </div>
        <div className="col text-xs" style={{ gap: 4, minWidth: 220 }}>
          {w.topCategories.slice(0, 2).map((c) => (
            <span key={c.name} className="faint">{c.icon} {c.name} · {formatMoney(c.amount)}</span>
          ))}
          {w.biggestPurchase && (
            <span className="faint">💸 biggest: {w.biggestPurchase.merchant} · {formatMoney(w.biggestPurchase.amount)}</span>
          )}
          {w.upcomingBills.length > 0 && (
            <span className="warn">🧾 next 7 days: {w.upcomingBills.length} bill{w.upcomingBills.length === 1 ? "" : "s"} · {formatMoney(w.upcomingBills.reduce((s2, b) => s2 + b.amount, 0))}</span>
          )}
          {w.budgetPace && (
            <span className={w.budgetPace.pctUsed > w.budgetPace.pctElapsed ? "warn" : "faint"}>
              ◫ budgets {w.budgetPace.pctUsed}% used · {w.budgetPace.pctElapsed}% of month gone
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const RANGES = [3, 6, 12];

export function ReportsPage() {
  const [months, setMonths] = useState(6);
  const [exporting, setExporting] = useState(false);
  const reportQ = useReport(months);
  const report = reportQ.data;

  async function exportCsv() {
    setExporting(true);
    try {
      const blob = await api.exportCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "budgetsmart-transactions.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed.");
    } finally {
      setExporting(false);
    }
  }

  const categoryTotal = report ? report.categoryBreakdown.reduce((s, c) => s + c.spent, 0) : 0;

  return (
    <div className="page">
      <WeeklyCard />
      {/* controls */}
      <div className="card">
        <div className="row between wrap" style={{ gap: 16 }}>
          <div className="col gap-sm">
            <span className="label">Range</span>
            <div className="row gap-sm">
              {RANGES.map((r) => (
                <button key={r} className={`btn btn-sm ${months === r ? "btn-primary" : ""}`} onClick={() => setMonths(r)}>
                  {r} months
                </button>
              ))}
            </div>
          </div>
          <button className="btn" onClick={exportCsv} disabled={exporting}>
            {exporting ? <span className="ring" /> : "⭳ Export CSV"}
          </button>
        </div>
      </div>

      {reportQ.isLoading || !report ? (
        <Spinner label="Crunching your numbers…" />
      ) : (
        <>
          {/* summary */}
          <div className="grid grid-3">
            <div className="card">
              <span className="card-title">Income · {report.summary.months}mo</span>
              <div className="stat stat-lg accent" style={{ marginTop: 8 }}>
                <Money cents={report.summary.totalIncome} />
              </div>
            </div>
            <div className="card">
              <span className="card-title">Spending · {report.summary.months}mo</span>
              <div className="stat stat-lg danger" style={{ marginTop: 8 }}>
                <Money cents={report.summary.totalExpense} />
              </div>
              <div className="faint text-xs" style={{ marginTop: 6 }}>
                {formatMoney(report.summary.avgMonthlyExpense)}/mo avg
              </div>
            </div>
            <div className="card">
              <span className="card-title">Savings rate</span>
              <div className={`stat stat-lg ${report.summary.savingsRate >= 0 ? "accent" : "danger"}`} style={{ marginTop: 8 }}>
                {Math.round(report.summary.savingsRate * 100)}%
              </div>
              <div className="faint text-xs" style={{ marginTop: 6 }}>
                net <Money cents={report.summary.net} className="text-xs" signed />
              </div>
            </div>
          </div>

          {/* cashflow */}
          <div className="card">
            <span className="card-title">Monthly cashflow</span>
            <div style={{ marginTop: 16 }}>
              <CashflowChart data={report.cashflow} />
            </div>
            <div className="row gap-lg" style={{ marginTop: 12 }}>
              <Legend color="#00FF41" label="Income" />
              <Legend color="#FF0033" label="Expense" />
            </div>
          </div>

          {/* net worth trend */}
          <div className="card">
            <div className="row between" style={{ marginBottom: 8 }}>
              <span className="card-title">Net worth trend</span>
              {report.netWorth.length > 0 && (
                <Money cents={report.netWorth[report.netWorth.length - 1]!.net} colorize className="text-sm" />
              )}
            </div>
            <NetWorthChart data={report.netWorth} />
          </div>

          <div className="grid grid-dash">
            {/* category breakdown */}
            <div className="card">
              <div className="row between" style={{ marginBottom: 16 }}>
                <span className="card-title">Spending by category</span>
                <span className="faint text-xs">{formatMoney(categoryTotal)} total</span>
              </div>
              {report.categoryBreakdown.length === 0 ? (
                <EmptyState title="No spending in range" />
              ) : (
                <SpendDonut data={report.categoryBreakdown} total={categoryTotal} />
              )}
            </div>

            {/* top merchants */}
            <div className="card">
              <span className="card-title">Top merchants</span>
              <div className="ledger" style={{ marginTop: 10 }}>
                {report.topMerchants.length === 0 ? (
                  <EmptyState title="No merchants yet" />
                ) : (
                  report.topMerchants.map((m) => (
                    <div className="row between" key={m.merchant} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                      <div className="col" style={{ minWidth: 0 }}>
                        <span className="text-sm truncate" style={{ maxWidth: 180 }}>{m.merchant}</span>
                        <span className="faint text-xs">{m.count} purchase{m.count === 1 ? "" : "s"}</span>
                      </div>
                      <Money cents={m.total} className="text-sm" />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="row gap-sm" style={{ gap: 6 }}>
      <span className="dot" style={{ background: color }} />
      <span className="faint text-xs">{label}</span>
    </div>
  );
}

/** Grouped income/expense bars per month. */
function CashflowChart({ data }: { data: CashflowPoint[] }) {
  const h = 150;
  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
  return (
    <div className="row" style={{ alignItems: "flex-end", gap: 10, height: h + 22 }}>
      {data.map((d) => (
        <div key={d.month} className="col grow" style={{ alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
          <div className="row" style={{ alignItems: "flex-end", gap: 3, height: h, width: "100%", justifyContent: "center" }}>
            <Bar value={d.income} max={max} h={h} color="#00FF41" title={`Income ${formatMoneyCompact(d.income)}`} />
            <Bar value={d.expense} max={max} h={h} color="#FF0033" title={`Expense ${formatMoneyCompact(d.expense)}`} />
          </div>
          <span className="faint text-xs">{monthAbbr(d.month)}</span>
        </div>
      ))}
    </div>
  );
}

function Bar({ value, max, h, color, title }: { value: number; max: number; h: number; color: string; title: string }) {
  const height = Math.max(value > 0 ? 2 : 0, (value / max) * h);
  return (
    <div
      title={title}
      style={{
        width: 14,
        height,
        background: color,
        borderRadius: "3px 3px 0 0",
        boxShadow: value > 0 ? `0 0 8px ${color}66` : "none",
        transition: "height .3s cubic-bezier(.4,0,.2,1)",
      }}
    />
  );
}

/** Net worth line + area over the range. */
function NetWorthChart({ data }: { data: NetWorthPoint[] }) {
  const w = 720;
  const h = 150;
  const pad = 6;
  if (data.length < 2) return <div className="faint text-sm">Not enough history to chart.</div>;

  const vals = data.map((d) => d.net);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 1);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / span) * (h - pad * 2);

  const line = data.map((d, i) => `${x(i).toFixed(1)},${y(d.net).toFixed(1)}`).join(" ");
  const area = `${x(0).toFixed(1)},${h - pad} ${line} ${x(data.length - 1).toFixed(1)},${h - pad}`;

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00FF41" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#00FF41" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#nwFill)" />
      <polyline points={line} fill="none" stroke="#00FF41" strokeWidth="2" style={{ filter: "drop-shadow(0 0 4px rgba(0,255,65,.6))" }} />
      {data.map((d, i) => (
        <circle key={d.month} cx={x(i)} cy={y(d.net)} r="2.5" fill="#000" stroke="#00FF41" strokeWidth="1.5" />
      ))}
    </svg>
  );
}
