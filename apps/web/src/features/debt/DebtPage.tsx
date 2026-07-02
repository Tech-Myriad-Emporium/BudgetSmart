import {
  formatMoney,
  formatMoneyCompact,
  type Debt,
  type DebtStrategy,
  type PayoffPoint,
} from "@budgetsmart/shared";
import { useMemo, useState } from "react";
import { EmptyState, Money, Spinner } from "../../components/ui";
import { useDebtPlan, useDebts } from "../../lib/hooks";
import { formatDateShort } from "../../lib/format";
import { DebtModal } from "./DebtModal";

const fmtApr = (bps: number) => `${(bps / 100).toFixed(2)}%`;

function fmtMonths(m: number): string {
  if (m <= 0) return "0 mo";
  const y = Math.floor(m / 12);
  const mo = m % 12;
  return [y ? `${y}y` : "", mo ? `${mo}mo` : ""].filter(Boolean).join(" ") || "0 mo";
}

const EXTRA_PRESETS = [0, 5000, 10000, 25000, 50000];

export function DebtPage() {
  const debtsQ = useDebts();
  const [strategy, setStrategy] = useState<DebtStrategy>("avalanche");
  const [extra, setExtra] = useState(10000);
  const [extraText, setExtraText] = useState("100");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Debt | null>(null);

  const planQ = useDebtPlan(strategy, extra);
  const overview = debtsQ.data;
  const plan = planQ.data;

  const debtById = useMemo(() => new Map((overview?.debts ?? []).map((d) => [d.id, d])), [overview]);

  function applyExtra(text: string) {
    setExtraText(text);
    const n = Math.max(0, Math.round(Number(text.replace(/[^0-9.]/g, "")) * 100 || 0));
    setExtra(n);
  }

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(d: Debt) {
    setEditing(d);
    setModalOpen(true);
  }

  const hasDebts = (overview?.count ?? 0) > 0;

  return (
    <div className="page">
      {/* overview */}
      <div className="card">
        <div className="row between wrap" style={{ gap: 16 }}>
          <div className="row" style={{ gap: 28 }}>
            <Stat label="Total owed" value={formatMoney(overview?.totalBalance ?? 0)} tone="danger" />
            <Stat label="Min / month" value={formatMoney(overview?.totalMinimum ?? 0)} />
            <Stat label="Avg APR" value={overview ? fmtApr(overview.weightedAprBps) : "—"} />
            <Stat label="Debts" value={String(overview?.count ?? 0)} />
          </div>
          <button className="btn btn-primary" onClick={openNew}>
            + Add debt
          </button>
        </div>
      </div>

      {debtsQ.isLoading ? (
        <Spinner label="Loading debts…" />
      ) : !hasDebts ? (
        <div className="card">
          <EmptyState icon="💳" title="No debts tracked" hint="Add a debt to build a payoff plan." />
        </div>
      ) : (
        <>
          {/* strategy + extra controls */}
          <div className="card">
            <div className="row between wrap" style={{ gap: 16 }}>
              <div className="col gap-sm">
                <span className="label">Strategy</span>
                <div className="row gap-sm">
                  <StrategyButton active={strategy === "avalanche"} onClick={() => setStrategy("avalanche")} title="Avalanche" sub="highest APR first" />
                  <StrategyButton active={strategy === "snowball"} onClick={() => setStrategy("snowball")} title="Snowball" sub="smallest balance first" />
                </div>
              </div>

              <div className="col gap-sm">
                <span className="label">Extra payment / month</span>
                <div className="row gap-sm wrap">
                  <div className="input-prefix" style={{ width: 120 }}>
                    <span>$</span>
                    <input
                      className="input mono"
                      inputMode="decimal"
                      value={extraText}
                      onChange={(e) => applyExtra(e.target.value)}
                    />
                  </div>
                  {EXTRA_PRESETS.map((p) => (
                    <button
                      key={p}
                      className={`chip ${extra === p ? "accent" : ""}`}
                      style={{ cursor: "pointer", borderColor: extra === p ? "var(--accent)" : undefined, color: extra === p ? "var(--accent)" : undefined }}
                      onClick={() => {
                        setExtra(p);
                        setExtraText(String(p / 100));
                      }}
                    >
                      +{formatMoneyCompact(p)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* plan summary */}
          {plan && (
            <>
              {!plan.viable && (
                <div className="card" style={{ borderColor: "var(--warning)" }}>
                  <span className="warn text-sm">
                    ⚠ At these minimums, the balances aren't fully cleared within the projection horizon — add an extra
                    payment to break through.
                  </span>
                </div>
              )}

              <div className="grid grid-3">
                <div className="card interactive">
                  <span className="card-title">Debt-free</span>
                  <div className="stat stat-xl accent" style={{ marginTop: 10 }}>
                    {plan.debtFreeDate ? formatDateShort(plan.debtFreeDate) : "—"}
                  </div>
                  <div className="faint text-xs" style={{ marginTop: 8 }}>
                    {fmtMonths(plan.totalMonths)} from now
                    {plan.monthsSaved > 0 ? ` · ${fmtMonths(plan.monthsSaved)} sooner` : ""}
                  </div>
                </div>

                <div className="card interactive">
                  <span className="card-title">Total interest</span>
                  <div className="stat stat-xl danger" style={{ marginTop: 10 }}>
                    <Money cents={plan.totalInterest} />
                  </div>
                  <div className="faint text-xs" style={{ marginTop: 8 }}>
                    on {formatMoney(plan.totalPrincipal)} of principal
                  </div>
                </div>

                <div className="card interactive">
                  <span className="card-title">Interest saved</span>
                  <div className="stat stat-xl accent" style={{ marginTop: 10 }}>
                    <Money cents={plan.interestSaved} />
                  </div>
                  <div className="faint text-xs" style={{ marginTop: 8 }}>
                    vs. minimums only ({strategy})
                  </div>
                </div>
              </div>

              {/* timeline */}
              <div className="card">
                <div className="row between" style={{ marginBottom: 8 }}>
                  <span className="card-title">Balance over time</span>
                  <span className="faint text-xs">{fmtMonths(plan.totalMonths)} to zero</span>
                </div>
                <PayoffChart points={plan.timeline} />
              </div>

              {/* payoff order */}
              <div className="card" style={{ padding: 0 }}>
                <div className="row between" style={{ padding: "16px 20px" }}>
                  <span className="card-title">Payoff order</span>
                  <span className="faint text-xs">{strategy === "avalanche" ? "highest APR first" : "smallest balance first"}</span>
                </div>
                <div className="divider" />
                <div className="ledger" style={{ padding: "4px 12px 12px" }}>
                  {plan.entries.map((e) => {
                    const d = debtById.get(e.debtId);
                    if (!d) return null;
                    return (
                      <div className="ledger-row clickable" key={e.debtId} onClick={() => openEdit(d)} style={{ gridTemplateColumns: "34px 1fr auto" }}>
                        <span className="cat-icon" style={{ borderColor: d.color }}>
                          {d.icon}
                        </span>
                        <div className="col" style={{ minWidth: 0 }}>
                          <div className="row gap-sm">
                            <span className="badge" style={{ borderColor: d.color, color: d.color }}>#{e.order}</span>
                            <span className="text-sm truncate">{d.name}</span>
                          </div>
                          <span className="faint text-xs">
                            {fmtApr(d.aprBps)} APR · min {formatMoney(d.minimumPayment)}
                            {e.payoffDate ? ` · clear ${formatDateShort(e.payoffDate)}` : " · not cleared"}
                            {e.interestPaid > 0 ? ` · ${formatMoney(e.interestPaid)} interest` : ""}
                          </span>
                        </div>
                        <Money cents={d.balance} className="danger" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </>
      )}


      {modalOpen && <DebtModal existing={editing} onClose={() => setModalOpen(false)} />}
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

function StrategyButton({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button className={`btn ${active ? "btn-primary" : ""}`} onClick={onClick} style={{ flexDirection: "column", alignItems: "flex-start", gap: 2, padding: "8px 14px" }}>
      <span style={{ fontWeight: 600 }}>{title}</span>
      <span className="text-xs faint">{sub}</span>
    </button>
  );
}

/** Filled area chart of total balance over the payoff months. */
function PayoffChart({ points }: { points: PayoffPoint[] }) {
  const w = 720;
  const h = 140;
  const pad = 4;
  if (points.length < 2) return <div className="faint text-sm">Not enough data to chart.</div>;

  const maxBal = Math.max(...points.map((p) => p.totalBalance), 1);
  const maxMonth = points[points.length - 1]!.monthIndex || 1;
  const x = (m: number) => pad + (m / maxMonth) * (w - pad * 2);
  const y = (b: number) => pad + (1 - b / maxBal) * (h - pad * 2);

  const line = points.map((p) => `${x(p.monthIndex).toFixed(1)},${y(p.totalBalance).toFixed(1)}`).join(" ");
  const area = `${pad},${h - pad} ${line} ${x(maxMonth).toFixed(1)},${h - pad}`;

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="payoffFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00FF41" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#00FF41" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#payoffFill)" />
      <polyline points={line} fill="none" stroke="#00FF41" strokeWidth="2" style={{ filter: "drop-shadow(0 0 4px rgba(0,255,65,.6))" }} />
    </svg>
  );
}
