import { formatMoney, type AutoTagSuggestion, type BudgetSuggestion, type OverspendAlert } from "@budgetsmart/shared";
import { EmptyState, Money, Spinner } from "../../components/ui";
import { useBudgetMutation, useInsights, useTransactionMutations } from "../../lib/hooks";
import { formatDateShort } from "../../lib/format";

export function InsightsPage() {
  const insightsQ = useInsights();
  const { update } = useTransactionMutations();
  const budgetMut = useBudgetMutation();
  const data = insightsQ.data;
  const month = new Date().toISOString().slice(0, 7);

  if (insightsQ.isLoading || !data) {
    return (
      <div className="page">
        <Spinner label="Analyzing your transactions…" />
      </div>
    );
  }

  const clean = data.cleanupCount === 0 && data.overspend.length === 0;

  return (
    <div className="page">
      {/* summary */}
      <div className="grid grid-3">
        <div className="card">
          <span className="card-title">Cleanup suggestions</span>
          <div className="stat stat-xl accent" style={{ marginTop: 10 }}>{data.cleanupCount}</div>
          <div className="faint text-xs" style={{ marginTop: 8 }}>
            duplicates, refunds, transfers & tags
          </div>
        </div>
        <div className="card">
          <span className="card-title">Overspending alerts</span>
          <div className={`stat stat-xl ${data.overspend.length ? "danger" : ""}`} style={{ marginTop: 10 }}>
            {data.overspend.length}
          </div>
          <div className="faint text-xs" style={{ marginTop: 8 }}>categories over or pacing over budget</div>
        </div>
        <div className="card">
          <span className="card-title">Auto-budget ideas</span>
          <div className="stat stat-xl" style={{ marginTop: 10 }}>{data.budgetSuggestions.length}</div>
          <div className="faint text-xs" style={{ marginTop: 8 }}>from your last 3 months of spending</div>
        </div>
      </div>

      {clean ? (
        <div className="card">
          <EmptyState icon="✨" title="Everything looks clean" hint="No duplicates, unmatched refunds, or overspending detected right now." />
        </div>
      ) : (
        <div className="grid grid-dash">
          <div className="col gap-md">
            {/* overspending */}
            {data.overspend.length > 0 && (
              <div className="card">
                <span className="card-title">⚠ Overspending</span>
                <div className="col" style={{ marginTop: 12 }}>
                  {data.overspend.map((a) => (
                    <OverspendRow key={a.categoryId} alert={a} />
                  ))}
                </div>
              </div>
            )}

            {/* auto-tag */}
            {data.autoTags.length > 0 && (
              <div className="card">
                <div className="row between">
                  <span className="card-title">🏷 Auto-tag uncategorized</span>
                  <span className="faint text-xs">{data.autoTags.length} suggestions</span>
                </div>
                <div className="col" style={{ marginTop: 12 }}>
                  {data.autoTags.slice(0, 8).map((s) => (
                    <AutoTagRow
                      key={s.transactionId}
                      s={s}
                      onApply={() => update.mutate({ id: s.transactionId, input: { categoryId: s.categoryId } })}
                      busy={update.isPending}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* duplicates */}
            {data.duplicates.length > 0 && (
              <div className="card">
                <span className="card-title">👯 Possible duplicates</span>
                <div className="col" style={{ marginTop: 12 }}>
                  {data.duplicates.map((d) => (
                    <div className="row between" key={`${d.a.id}-${d.b.id}`} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                      <div className="col" style={{ minWidth: 0 }}>
                        <span className="text-sm truncate">{d.a.merchant}</span>
                        <span className="faint text-xs">
                          {formatDateShort(d.a.date)} & {formatDateShort(d.b.date)} · same amount
                        </span>
                      </div>
                      <div className="row gap-sm">
                        <Money cents={d.a.amount} className="text-sm" />
                        <button
                          className="btn btn-sm"
                          disabled={update.isPending}
                          onClick={() => update.mutate({ id: d.b.id, input: { excluded: true } })}
                        >
                          Exclude copy
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="col gap-md">
            {/* refunds */}
            {data.refunds.length > 0 && (
              <div className="card">
                <span className="card-title">↩ Refunds detected</span>
                <p className="faint text-xs" style={{ margin: "8px 0 4px" }}>
                  Excluding both sides stops refunded purchases from skewing your trends.
                </p>
                <div className="col">
                  {data.refunds.map((r) => (
                    <div className="row between" key={r.refund.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                      <div className="col" style={{ minWidth: 0 }}>
                        <span className="text-sm truncate">{r.expense.merchant}</span>
                        <span className="faint text-xs">refunded {r.daysApart}d later</span>
                      </div>
                      <div className="row gap-sm">
                        <Money cents={r.expense.amount} className="text-sm" />
                        <button
                          className="btn btn-sm"
                          disabled={update.isPending}
                          onClick={() => {
                            update.mutate({ id: r.expense.id, input: { excluded: true } });
                            update.mutate({ id: r.refund.id, input: { excluded: true } });
                          }}
                        >
                          Fix trends
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* transfer candidates */}
            {data.transfers.length > 0 && (
              <div className="card">
                <span className="card-title">⇄ Look like transfers</span>
                <p className="faint text-xs" style={{ margin: "8px 0 4px" }}>
                  Matching in/out pairs across accounts — excluding them keeps spending honest.
                </p>
                <div className="col">
                  {data.transfers.map((tr) => (
                    <div className="row between" key={tr.out.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                      <div className="col" style={{ minWidth: 0 }}>
                        <span className="text-sm truncate">{tr.out.merchant || "Between accounts"}</span>
                        <span className="faint text-xs">{formatDateShort(tr.out.date)} · {tr.daysApart}d apart</span>
                      </div>
                      <div className="row gap-sm">
                        <Money cents={tr.out.amount} className="text-sm" />
                        <button
                          className="btn btn-sm"
                          disabled={update.isPending}
                          onClick={() => {
                            update.mutate({ id: tr.out.id, input: { excluded: true } });
                            update.mutate({ id: tr.in.id, input: { excluded: true } });
                          }}
                        >
                          Mark transfer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* auto-budget */}
            {data.budgetSuggestions.length > 0 && (
              <div className="card">
                <span className="card-title">◫ Auto-budget</span>
                <p className="faint text-xs" style={{ margin: "8px 0 4px" }}>
                  Based on your typical month. One click sets the budget.
                </p>
                <div className="col">
                  {data.budgetSuggestions.slice(0, 8).map((b) => (
                    <BudgetSuggestionRow
                      key={b.categoryId}
                      s={b}
                      busy={budgetMut.isPending}
                      onApply={() => budgetMut.mutate({ categoryId: b.categoryId, month, limit: b.suggested })}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OverspendRow({ alert }: { alert: OverspendAlert }) {
  const over = alert.severity === "over";
  return (
    <div className="row between" style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <div className="row gap-sm" style={{ minWidth: 0 }}>
        <span className="cat-icon" style={{ width: 30, height: 30, borderColor: alert.color, fontSize: 14 }}>{alert.icon}</span>
        <div className="col" style={{ minWidth: 0 }}>
          <span className="text-sm truncate">{alert.categoryName}</span>
          <span className={`text-xs ${over ? "danger" : "warn"}`}>
            {over
              ? `over budget by ${formatMoney(alert.spent - alert.limit)}`
              : `pacing to ${formatMoney(alert.projected)} of ${formatMoney(alert.limit)}`}
          </span>
        </div>
      </div>
      <div className="col" style={{ alignItems: "flex-end" }}>
        <Money cents={alert.spent} className="text-sm" />
        <span className="faint text-xs">of {formatMoney(alert.limit)}</span>
      </div>
    </div>
  );
}

function AutoTagRow({ s, onApply, busy }: { s: AutoTagSuggestion; onApply: () => void; busy: boolean }) {
  return (
    <div className="row between" style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <div className="row gap-sm" style={{ minWidth: 0 }}>
        <span className="cat-icon" style={{ width: 30, height: 30, borderColor: s.color, fontSize: 14 }}>{s.icon}</span>
        <div className="col" style={{ minWidth: 0 }}>
          <span className="text-sm truncate" style={{ maxWidth: 170 }}>{s.merchant}</span>
          <span className="faint text-xs">
            → {s.categoryName} · {s.source === "history" ? "from your history" : "keyword match"} · {Math.round(s.confidence * 100)}%
          </span>
        </div>
      </div>
      <div className="row gap-sm">
        <Money cents={s.amount} className="text-sm" />
        <button className="btn btn-sm" onClick={onApply} disabled={busy}>Apply</button>
      </div>
    </div>
  );
}

function BudgetSuggestionRow({ s, onApply, busy }: { s: BudgetSuggestion; onApply: () => void; busy: boolean }) {
  const same = s.currentLimit !== null && s.currentLimit === s.suggested;
  return (
    <div className="row between" style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <div className="row gap-sm" style={{ minWidth: 0 }}>
        <span className="cat-icon" style={{ width: 30, height: 30, borderColor: s.color, fontSize: 14 }}>{s.icon}</span>
        <div className="col" style={{ minWidth: 0 }}>
          <span className="text-sm truncate">{s.categoryName}</span>
          <span className="faint text-xs">
            {s.currentLimit === null ? "no budget yet" : `current ${formatMoney(s.currentLimit)}`}
          </span>
        </div>
      </div>
      <div className="row gap-sm">
        <Money cents={s.suggested} className="text-sm" />
        <button className="btn btn-sm" onClick={onApply} disabled={busy || same}>
          {same ? "Set ✓" : "Set"}
        </button>
      </div>
    </div>
  );
}
