import {
  currentMonth,
  formatMoney,
  nextMonth,
  parseMoney,
  previousMonth,
  type BudgetLine,
} from "@budgetsmart/shared";
import { useState } from "react";
import { EmptyState, Money, Spinner } from "../../components/ui";
import { useBudgetMutation, useBudgets, useCategories } from "../../lib/hooks";
import { formatMonthLong } from "../../lib/format";

export function BudgetsPage() {
  const [month, setMonth] = useState(currentMonth());
  const budgetsQ = useBudgets(month);
  const categoriesQ = useCategories();
  const setBudget = useBudgetMutation();

  const summary = budgetsQ.data?.summary;
  const expenseCats = (categoriesQ.data ?? []).filter((c) => c.kind === "expense" && !c.hidden);

  // categories with no line in the summary yet (limit 0, no spend) — offer to fund them.
  const lineIds = new Set((summary?.lines ?? []).map((l) => l.categoryId));
  const unbudgeted = expenseCats.filter((c) => !lineIds.has(c.id));

  return (
    <div className="page">
      {/* month switcher + totals */}
      <div className="card">
        <div className="row between wrap" style={{ gap: 16 }}>
          <div className="row gap-sm">
            <button className="btn btn-sm" onClick={() => setMonth(previousMonth(month))}>
              ←
            </button>
            <span className="stat" style={{ minWidth: 150, textAlign: "center" }}>
              {formatMonthLong(month)}
            </span>
            <button className="btn btn-sm" onClick={() => setMonth(nextMonth(month))}>
              →
            </button>
            {month !== currentMonth() && (
              <button className="btn btn-ghost btn-sm" onClick={() => setMonth(currentMonth())}>
                Today
              </button>
            )}
          </div>

          {summary && (
            <div className="row" style={{ gap: 28 }}>
              <Stat label="Budgeted" value={formatMoney(summary.totalLimit)} />
              <Stat label="Spent" value={formatMoney(summary.totalSpent)} />
              <Stat
                label="Remaining"
                value={formatMoney(summary.totalRemaining)}
                tone={summary.totalRemaining < 0 ? "danger" : "accent"}
              />
            </div>
          )}
        </div>
      </div>

      {budgetsQ.isLoading || !summary ? (
        <Spinner label="Loading budgets…" />
      ) : (
        <>
          <div className="card">
            <span className="card-title">Funded categories</span>
            <div className="col" style={{ marginTop: 8 }}>
              {summary.lines.length === 0 && (
                <EmptyState title="Nothing budgeted this month" hint="Fund a category below to get started." />
              )}
              {summary.lines.map((line) => (
                <BudgetRow
                  key={line.categoryId}
                  line={line}
                  saving={setBudget.isPending}
                  onSave={(limit) => setBudget.mutate({ categoryId: line.categoryId, month, limit })}
                />
              ))}
            </div>
          </div>

          {unbudgeted.length > 0 && (
            <div className="card">
              <span className="card-title">Add a budget</span>
              <div className="row wrap" style={{ gap: 8, marginTop: 14 }}>
                {unbudgeted.map((c) => (
                  <button
                    key={c.id}
                    className="chip"
                    style={{ cursor: "pointer" }}
                    onClick={() => setBudget.mutate({ categoryId: c.id, month, limit: 20000 })}
                    title="Fund with $200 to start"
                  >
                    {c.icon} {c.name} +
                  </button>
                ))}
              </div>
              <div className="faint text-xs" style={{ marginTop: 10 }}>
                Adds a $200 starter limit you can edit. Rollover follows each category's setting.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" | "accent" }) {
  return (
    <div className="col">
      <span className="label">{label}</span>
      <span className={`stat stat-lg ${tone ?? ""}`}>{value}</span>
    </div>
  );
}

function BudgetRow({
  line,
  onSave,
  saving,
}: {
  line: BudgetLine;
  onSave: (limit: number) => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(line.limit / 100));
  const pct = Math.round(line.progress * 100);
  const cls = line.overspent ? "over" : line.progress > 0.85 ? "warn" : "";

  function commit() {
    const cents = parseMoney(value);
    setEditing(false);
    if (cents != null && cents !== line.limit) onSave(cents);
  }

  return (
    <div className="ledger-row" style={{ gridTemplateColumns: "34px 1fr 200px" }}>
      <span className="cat-icon" style={{ borderColor: line.color }}>
        {line.icon}
      </span>

      <div className="col gap-sm" style={{ minWidth: 0 }}>
        <div className="row between">
          <div className="row gap-sm">
            <span className="text-sm">{line.categoryName}</span>
            {line.rolledOver !== 0 && (
              <span className={`badge text-xs ${line.rolledOver > 0 ? "accent" : "danger"}`}>
                {line.rolledOver > 0 ? "+" : ""}
                {formatMoney(line.rolledOver)} rollover
              </span>
            )}
          </div>
          <span className="num text-xs faint">{pct}%</span>
        </div>
        <div className={`progress ${cls}`}>
          <span style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <div className="row between text-xs">
          <span className="faint">
            <Money cents={line.spent} className="text-xs" /> of{" "}
            <Money cents={line.available} className="text-xs" /> spent
          </span>
          <span className={line.remaining < 0 ? "danger" : "muted"}>
            {line.remaining < 0 ? "over by " : ""}
            <Money cents={Math.abs(line.remaining)} className="text-xs" />
            {line.remaining < 0 ? "" : " left"}
          </span>
        </div>
      </div>

      <div className="row" style={{ justifyContent: "flex-end" }}>
        {editing ? (
          <div className="input-prefix" style={{ width: 130 }}>
            <span>$</span>
            <input
              className="input mono"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => e.key === "Enter" && commit()}
              disabled={saving}
            />
          </div>
        ) : (
          <button className="btn btn-sm" onClick={() => setEditing(true)}>
            {formatMoney(line.limit)} ✎
          </button>
        )}
      </div>
    </div>
  );
}
