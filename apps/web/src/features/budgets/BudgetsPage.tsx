import {
  currentMonth,
  formatMoney,
  nextMonth,
  parseMoney,
  previousMonth,
  type BudgetLine,
} from "@budgetsmart/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EmptyState, Money, Spinner } from "../../components/ui";
import { api } from "../../lib/api";
import { useBudgetMutation, useBudgets, useCategories } from "../../lib/hooks";
import { formatMonthLong } from "../../lib/format";

/** Create a category (optionally as a sub-category of a root category). */
function NewCategoryForm() {
  const categoriesQ = useCategories();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("💸");
  const [parentId, setParentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const roots = (categoriesQ.data ?? []).filter((c) => c.kind === "expense" && !c.hidden && !c.parentId);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api.createCategory({ name: name.trim(), kind: "expense", icon: icon || "💸", parentId: parentId || null });
      setName("");
      setParentId("");
      qc.invalidateQueries({ queryKey: ["categories"] });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <span className="card-title">New category</span>
      <div className="row gap-sm wrap" style={{ marginTop: 12 }}>
        <input className="input btn-sm" style={{ width: 64, textAlign: "center" }} value={icon} maxLength={4} onChange={(e) => setIcon(e.target.value)} title="Icon (emoji)" />
        <input className="input btn-sm" style={{ flex: 1, minWidth: 160 }} placeholder="Category name (e.g. Coffee)" value={name}
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
        <select className="select btn-sm" style={{ width: 190 }} value={parentId} onChange={(e) => setParentId(e.target.value)} title="Optional parent — makes this a sub-category">
          <option value="">No parent (top-level)</option>
          {roots.map((c) => (
            <option key={c.id} value={c.id}>↳ under {c.icon} {c.name}</option>
          ))}
        </select>
        <button className="btn btn-primary btn-sm" onClick={create} disabled={busy || !name.trim()}>+ Create</button>
      </div>
      {err && <div className="text-xs" style={{ color: "var(--danger)", marginTop: 8 }}>{err}</div>}
      <div className="faint text-xs" style={{ marginTop: 8 }}>
        Sub-categories get their own budgets and roll up visually under their parent.
      </div>
    </div>
  );
}

export function BudgetsPage() {
  const [month, setMonth] = useState(currentMonth());
  const budgetsQ = useBudgets(month);
  const categoriesQ = useCategories();
  const setBudget = useBudgetMutation();

  const summary = budgetsQ.data?.summary;
  const expenseCats = (categoriesQ.data ?? []).filter((c) => c.kind === "expense" && !c.hidden);
  const parentOf = new Map(expenseCats.map((c) => [c.id, c.parentId]));
  const catName = new Map(expenseCats.map((c) => [c.id, c.name]));

  // categories with no line in the summary yet (limit 0, no spend) — offer to fund them.
  const lineIds = new Set((summary?.lines ?? []).map((l) => l.categoryId));
  const unbudgeted = expenseCats.filter((c) => !lineIds.has(c.id));

  // group lines: sub-category lines follow their parent (or its slot), indented.
  const lines = summary?.lines ?? [];
  const rootLines = lines.filter((l) => !parentOf.get(l.categoryId));
  const childLines = lines.filter((l) => parentOf.get(l.categoryId));
  const ordered: Array<{ line: (typeof lines)[number]; child: boolean }> = [];
  for (const l of rootLines) {
    ordered.push({ line: l, child: false });
    for (const cl of childLines.filter((c) => parentOf.get(c.categoryId) === l.categoryId)) {
      ordered.push({ line: cl, child: true });
    }
  }
  // children whose parent has no budget line yet — keep them visible at the end
  for (const cl of childLines.filter((c) => !rootLines.some((r) => r.categoryId === parentOf.get(c.categoryId)))) {
    ordered.push({ line: cl, child: true });
  }

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
              {ordered.map(({ line, child }) => (
                <BudgetRow
                  key={line.categoryId}
                  line={line}
                  child={child}
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
                    {c.parentId ? `${c.icon} ${catName.get(c.parentId) ?? ""} ↳ ${c.name} +` : `${c.icon} ${c.name} +`}
                  </button>
                ))}
              </div>
              <div className="faint text-xs" style={{ marginTop: 10 }}>
                Adds a $200 starter limit you can edit. Rollover follows each category's setting.
              </div>
            </div>
          )}

          <NewCategoryForm />
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
  child = false,
  onSave,
  saving,
}: {
  line: BudgetLine;
  child?: boolean;
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
    <div className="ledger-row" style={{ gridTemplateColumns: "34px 1fr 200px", paddingLeft: child ? 30 : undefined }}>
      <span className="cat-icon" style={{ borderColor: line.color, opacity: child ? 0.85 : 1 }}>
        {child ? "↳" : line.icon}
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
