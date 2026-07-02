import { formatMoney, type ImportAnalysis, type ImportCandidate, type TransactionType } from "@budgetsmart/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Spinner } from "../../components/ui";
import { api } from "../../lib/api";
import { useAccounts, useCategories } from "../../lib/hooks";
import { formatDateShort } from "../../lib/format";

type Stage = "pick" | "previewing" | "review" | "committing" | "done";

interface RowState {
  selected: boolean;
  categoryId: string | null;
}

export function ImportPage() {
  const accountsQ = useAccounts();
  const categoriesQ = useCategories();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("pick");
  const [fileName, setFileName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [rowState, setRowState] = useState<Map<number, RowState>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState(0);

  const accounts = (accountsQ.data ?? []).filter((a) => !a.archived);
  const categories = (categoriesQ.data ?? []).filter((c) => !c.hidden);

  async function onFile(file: File) {
    setError(null);
    setFileName(file.name);
    if (file.size > 6_000_000) {
      setError("File is too large (max 6 MB). Export a shorter date range.");
      return;
    }
    setStage("previewing");
    try {
      const content = await file.text();
      const r = await api.importPreview(content);
      const a = r.analysis;
      if (a.candidates.length === 0) {
        setError(
          a.format === "csv" && !a.mapping
            ? "Couldn't detect the CSV columns. Make sure the file has Date, Description and Amount (or Debit/Credit) columns."
            : "No transactions found in this file.",
        );
        setStage("pick");
        return;
      }
      const rs = new Map<number, RowState>();
      for (const c of a.candidates) rs.set(c.index, { selected: !c.duplicate, categoryId: c.suggestedCategoryId });
      setAnalysis(a);
      setRowState(rs);
      setStage("review");
    } catch (e) {
      setError((e as Error).message || "Couldn't read that file.");
      setStage("pick");
    }
  }

  async function commit() {
    if (!analysis || !accountId) return;
    const rows = analysis.candidates
      .filter((c) => rowState.get(c.index)?.selected)
      .map((c) => ({
        date: c.date,
        amount: c.amount,
        type: c.type as TransactionType,
        merchant: c.merchant,
        note: c.note,
        categoryId: rowState.get(c.index)?.categoryId ?? null,
      }));
    if (rows.length === 0) return;
    setStage("committing");
    setError(null);
    try {
      const r = await api.importCommit(accountId, rows);
      setCreatedCount(r.created);
      setStage("done");
      qc.invalidateQueries();
    } catch (e) {
      setError((e as Error).message || "Import failed.");
      setStage("review");
    }
  }

  function reset() {
    setStage("pick");
    setAnalysis(null);
    setRowState(new Map());
    setFileName("");
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const selectedCount = analysis ? analysis.candidates.filter((c) => rowState.get(c.index)?.selected).length : 0;

  /* ---------------- pick / done stages ---------------- */
  if (stage === "pick" || stage === "previewing") {
    return (
      <div className="page">
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 40 }}>📄</div>
          <h3 style={{ margin: "10px 0 6px" }}>Import a bank statement</h3>
          <p className="faint text-sm" style={{ maxWidth: 480, margin: "0 auto 18px" }}>
            Export transactions from your bank as <b>CSV</b>, <b>OFX/QFX</b> (Quicken/Money), or <b>QIF</b> and drop the
            file here. BudgetSmart auto-categorizes from your history and skips anything you already have — your data
            never leaves this device.
          </p>
          {stage === "previewing" ? (
            <Spinner label={`Reading ${fileName}…`} />
          ) : (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.ofx,.qfx,.qif,text/csv"
                hidden
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
              <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>Choose file…</button>
            </>
          )}
          {error && <div className="text-sm" style={{ color: "var(--danger)", marginTop: 14 }}>{error}</div>}
        </div>
      </div>
    );
  }

  if (stage === "done") {
    return (
      <div className="page">
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 40 }}>✅</div>
          <h3 style={{ margin: "10px 0 6px" }}>{createdCount} transaction{createdCount === 1 ? "" : "s"} imported</h3>
          <p className="faint text-sm">They're tagged “imported” so you can find them, and budgets, reports and insights already include them.</p>
          <div className="row gap-sm" style={{ justifyContent: "center", marginTop: 16 }}>
            <button className="btn btn-primary" onClick={reset}>Import another file</button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- review stage ---------------- */
  if (!analysis) return null;

  return (
    <div className="page">
      {/* summary + controls */}
      <div className="card">
        <div className="row between wrap" style={{ gap: 12 }}>
          <div className="col">
            <span className="card-title">{fileName} · {analysis.format.toUpperCase()}</span>
            <span className="faint text-xs" style={{ marginTop: 4 }}>
              {analysis.candidates.length} transactions
              {analysis.dateFrom && ` · ${formatDateShort(analysis.dateFrom)} → ${formatDateShort(analysis.dateTo!)}`}
              {" · "}{analysis.newCount} new · {analysis.duplicateCount} duplicates skipped · {analysis.categorizedCount} auto-categorized
              {analysis.skipped > 0 && ` · ${analysis.skipped} unreadable lines`}
            </span>
          </div>
          <div className="row gap-sm wrap">
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Import into account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <button className="btn" onClick={reset}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={commit}
              disabled={stage === "committing" || !accountId || selectedCount === 0}
              title={!accountId ? "Choose an account first" : undefined}
            >
              {stage === "committing" ? <span className="ring" /> : `Import ${selectedCount} selected`}
            </button>
          </div>
        </div>
        {error && <div className="text-sm" style={{ color: "var(--danger)", marginTop: 10 }}>{error}</div>}
      </div>

      {/* rows */}
      <div className="card" style={{ padding: 0 }}>
        <div className="row between" style={{ padding: "14px 20px" }}>
          <span className="card-title">Review</span>
          <span className="row gap-sm">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setRowState((prev) => {
                const next = new Map(prev);
                for (const [k, v] of next) next.set(k, { ...v, selected: true });
                return next;
              })}
            >
              Select all
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setRowState((prev) => {
                const next = new Map(prev);
                for (const c of analysis.candidates) next.set(c.index, { ...next.get(c.index)!, selected: !c.duplicate });
                return next;
              })}
            >
              New only
            </button>
          </span>
        </div>
        <div className="divider" />
        <div className="ledger" style={{ padding: "4px 12px 12px", maxHeight: 520, overflowY: "auto" }}>
          {analysis.candidates.map((c) => (
            <CandidateRow
              key={c.index}
              c={c}
              state={rowState.get(c.index)!}
              categories={categories}
              onToggle={() => setRowState((prev) => {
                const next = new Map(prev);
                const s = next.get(c.index)!;
                next.set(c.index, { ...s, selected: !s.selected });
                return next;
              })}
              onCategory={(categoryId) => setRowState((prev) => {
                const next = new Map(prev);
                next.set(c.index, { ...next.get(c.index)!, categoryId });
                return next;
              })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CandidateRow({
  c,
  state,
  categories,
  onToggle,
  onCategory,
}: {
  c: ImportCandidate;
  state: RowState;
  categories: Array<{ id: string; name: string; icon: string; kind: string }>;
  onToggle: () => void;
  onCategory: (id: string | null) => void;
}) {
  const income = c.type === "income";
  return (
    <div
      className="ledger-row"
      style={{ gridTemplateColumns: "28px 90px 1fr 170px auto", opacity: state.selected ? 1 : 0.45 }}
    >
      <input type="checkbox" checked={state.selected} onChange={onToggle} style={{ accentColor: "var(--accent)" }} />
      <span className="faint text-xs">{formatDateShort(c.date)}</span>
      <div className="col" style={{ minWidth: 0 }}>
        <span className="text-sm truncate">{c.merchant}</span>
        <span className="faint text-xs">
          {c.duplicate ? (
            <span className="warn">⚠ {c.duplicateReason}</span>
          ) : c.suggestedSource ? (
            `auto: ${c.suggestedSource === "history" ? "from your history" : "keyword match"}`
          ) : (
            c.note ?? ""
          )}
        </span>
      </div>
      {income ? (
        <span className="faint text-xs">income</span>
      ) : (
        <select
          className="select btn-sm"
          style={{ width: "100%" }}
          value={state.categoryId ?? ""}
          onChange={(e) => onCategory(e.target.value || null)}
        >
          <option value="">Uncategorized</option>
          {categories.filter((cat) => cat.kind === "expense").map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
          ))}
        </select>
      )}
      <span className={`text-sm mono ${income ? "accent" : ""}`} style={{ textAlign: "right" }}>
        {income ? "+" : "−"}{formatMoney(c.amount)}
      </span>
    </div>
  );
}
