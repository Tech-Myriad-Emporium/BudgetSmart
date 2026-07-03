import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ASSET_CLASS_LABELS,
  formatMoney,
  formatMoneyCompact,
  type GrowthProjection,
  type Holding,
  type Portfolio,
} from "@budgetsmart/shared";
import { useState, useEffect } from "react";
import { SpendDonut } from "../../components/charts";
import { EmptyState, Money, Spinner } from "../../components/ui";
import { usePortfolio, useProjection } from "../../lib/hooks";
import { api } from "../../lib/api";
import { HoldingModal } from "./HoldingModal";

const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;


/** Pull live market quotes into holdings' current prices. */
function SyncPricesButton() {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const sync = useMutation({
    mutationFn: () => api.refreshPrices(),
    onSuccess: (r) => {
      setMsg(r.updated > 0 ? `✓ ${r.updated} price${r.updated === 1 ? "" : "s"} updated` : "No symbols matched the market");
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      qc.invalidateQueries({ queryKey: ["networth"] });
    },
    onError: (e) => setMsg((e as Error).message),
  });
  useEffect(() => {
    sync.mutate(); // auto-sync when the page opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="row gap-sm" style={{ alignItems: "center" }}>
      {msg && <span className="faint text-xs">{msg}</span>}
      <button className="btn btn-sm" onClick={() => sync.mutate()} disabled={sync.isPending} title="Update holding prices from live market data">
        {sync.isPending ? <span className="ring" /> : "⟳ Sync market prices"}
      </button>
    </div>
  );
}

export function InvestmentsPage() {
  const portfolioQ = usePortfolio();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Holding | null>(null);
  const portfolio = portfolioQ.data;

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(h: Holding) {
    setEditing(h);
    setModalOpen(true);
  }

  const hasHoldings = (portfolio?.holdings.length ?? 0) > 0;

  return (
    <div className="page">
      <div className="row" style={{ justifyContent: "flex-end" }}><SyncPricesButton /></div>
      {/* summary */}
      <div className="grid grid-3">
        <div className="card">
          <span className="card-title">Portfolio value</span>
          <div className="stat stat-xl" style={{ marginTop: 10 }}>
            <Money cents={portfolio?.totalValue ?? 0} />
          </div>
          <div className="faint text-xs" style={{ marginTop: 8 }}>
            {formatMoney(portfolio?.totalCost ?? 0)} invested
          </div>
        </div>
        <div className="card">
          <span className="card-title">Total gain</span>
          <div className={`stat stat-xl ${(portfolio?.totalGain ?? 0) >= 0 ? "accent" : "danger"}`} style={{ marginTop: 10 }}>
            <Money cents={portfolio?.totalGain ?? 0} signed />
          </div>
          <div className={`text-xs ${(portfolio?.totalGain ?? 0) >= 0 ? "accent" : "danger"}`} style={{ marginTop: 8 }}>
            {portfolio ? pct(portfolio.totalGainPct) : "—"} all-time
          </div>
        </div>
        <div className="card">
          <span className="card-title">Holdings</span>
          <div className="stat stat-xl" style={{ marginTop: 10 }}>
            {portfolio?.holdings.length ?? 0}
          </div>
          <div className="row" style={{ marginTop: 10, justifyContent: "flex-end" }}>
            <button className="btn btn-primary btn-sm" onClick={openNew}>
              + Add holding
            </button>
          </div>
        </div>
      </div>

      {portfolioQ.isLoading ? (
        <Spinner label="Loading portfolio…" />
      ) : !hasHoldings ? (
        <div className="card">
          <EmptyState icon="📈" title="No holdings yet" hint="Add an investment to track your portfolio." />
        </div>
      ) : portfolio ? (
        <>
          <div className="grid grid-dash">
            {/* allocation */}
            <div className="card">
              <span className="card-title">Asset allocation</span>
              <div style={{ marginTop: 14 }}>
                <SpendDonut
                  total={portfolio.totalValue}
                  data={portfolio.allocation.map((a) => ({
                    categoryId: a.assetClass,
                    categoryName: a.label,
                    icon: "",
                    color: a.color,
                    spent: a.value,
                    share: a.share,
                  }))}
                />
              </div>
            </div>

            {/* holdings */}
            <div className="card" style={{ padding: 0 }}>
              <div className="row between" style={{ padding: "16px 20px" }}>
                <span className="card-title">Holdings</span>
                <span className="faint text-xs">click to edit</span>
              </div>
              <div className="divider" />
              <div className="ledger" style={{ padding: "4px 12px 12px" }}>
                {portfolio.holdings.map((h) => (
                  <div className="ledger-row clickable" key={h.id} onClick={() => openEdit(h)} style={{ gridTemplateColumns: "auto 1fr auto" }}>
                    <span className="chip" style={{ minWidth: 52, justifyContent: "center" }}>{h.symbol || h.assetClass}</span>
                    <div className="col" style={{ minWidth: 0 }}>
                      <span className="text-sm truncate">{h.name}</span>
                      <span className="faint text-xs">
                        {h.quantity} @ {formatMoney(h.currentPrice)} · {h.accountLabel} · {ASSET_CLASS_LABELS[h.assetClass]}
                      </span>
                    </div>
                    <div className="col" style={{ alignItems: "flex-end" }}>
                      <Money cents={h.value} className="text-sm" />
                      <span className={`text-xs ${h.gain >= 0 ? "accent" : "danger"}`}>{pct(h.gainPct)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <GrowthProjector startValue={portfolio.totalValue} />
        </>
      ) : null}

      {modalOpen && <HoldingModal existing={editing} onClose={() => setModalOpen(false)} />}
    </div>
  );
}

function GrowthProjector({ startValue }: { startValue: number }) {
  const [monthlyText, setMonthlyText] = useState("500");
  const [monthly, setMonthly] = useState(50000);
  const [ret, setRet] = useState(7);
  const [years, setYears] = useState(20);

  const projQ = useProjection(monthly, ret, years);
  const proj = projQ.data;

  function applyMonthly(text: string) {
    setMonthlyText(text);
    setMonthly(Math.max(0, Math.round(Number(text.replace(/[^0-9.]/g, "")) * 100 || 0)));
  }

  return (
    <div className="card">
      <div className="row between wrap" style={{ gap: 16, marginBottom: 16 }}>
        <span className="card-title">Growth projection</span>
        <div className="row gap-sm wrap">
          <div className="col gap-sm">
            <span className="text-xs faint">Monthly</span>
            <div className="input-prefix" style={{ width: 110 }}>
              <span>$</span>
              <input className="input mono btn-sm" style={{ padding: "6px 10px 6px 22px" }} value={monthlyText} onChange={(e) => applyMonthly(e.target.value)} />
            </div>
          </div>
          <div className="col gap-sm">
            <span className="text-xs faint">Return %</span>
            <input className="input mono btn-sm" style={{ width: 70, padding: "6px 10px" }} value={ret} onChange={(e) => setRet(Number(e.target.value) || 0)} />
          </div>
          <div className="col gap-sm">
            <span className="text-xs faint">Years</span>
            <div className="row gap-sm">
              {[10, 20, 30].map((y) => (
                <button key={y} className={`btn btn-sm ${years === y ? "btn-primary" : ""}`} onClick={() => setYears(y)}>
                  {y}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {proj && (
        <>
          <div className="row gap-lg wrap" style={{ marginBottom: 16 }}>
            <div className="col">
              <span className="label">Projected value</span>
              <span className="stat stat-lg accent"><Money cents={proj.endValue} /></span>
            </div>
            <div className="col">
              <span className="label">Contributed</span>
              <span className="stat stat-lg"><Money cents={proj.totalContributed} /></span>
            </div>
            <div className="col">
              <span className="label">Growth</span>
              <span className="stat stat-lg accent"><Money cents={proj.totalGrowth} /></span>
            </div>
          </div>
          <ProjectionChart proj={proj} />
          <div className="row gap-lg" style={{ marginTop: 10 }}>
            <Legend color="#00FF41" label="Projected value" />
            <Legend color="#5A5A5A" label="Contributed" />
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

function ProjectionChart({ proj }: { proj: GrowthProjection }) {
  const w = 720;
  const h = 160;
  const pad = 6;
  const pts = proj.points;
  if (pts.length < 2) return <div className="faint text-sm">Increase the horizon to project.</div>;

  const max = Math.max(...pts.map((p) => p.value), 1);
  const x = (i: number) => pad + (i / (pts.length - 1)) * (w - pad * 2);
  const y = (v: number) => pad + (1 - v / max) * (h - pad * 2);

  const valueLine = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const contribLine = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.contributed).toFixed(1)}`).join(" ");
  const area = `${x(0).toFixed(1)},${h - pad} ${valueLine} ${x(pts.length - 1).toFixed(1)},${h - pad}`;

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00FF41" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#00FF41" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#growthFill)" />
      <polyline points={contribLine} fill="none" stroke="#5A5A5A" strokeWidth="1.5" strokeDasharray="4 4" />
      <polyline points={valueLine} fill="none" stroke="#00FF41" strokeWidth="2" style={{ filter: "drop-shadow(0 0 4px rgba(0,255,65,.6))" }} />
      <text x={w - 6} y={y(max) + 12} textAnchor="end" fill="#9CA3AF" fontSize="10" className="num">
        {formatMoneyCompact(proj.endValue)}
      </text>
    </svg>
  );
}
