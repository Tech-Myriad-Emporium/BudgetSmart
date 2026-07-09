import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ASSET_CLASS_LABELS,
  formatMoney,
  formatMoneyCompact,
  type GrowthProjection,
  type Holding,
  type Portfolio,
  runBacktest,
  type BacktestResult,
  type BacktestPoint,
} from "@budgetsmart/shared";
import { useState, useEffect } from "react";
import { SpendDonut } from "../../components/charts";
import { EmptyState, Money, Spinner } from "../../components/ui";
import { usePortfolio, useProjection } from "../../lib/hooks";
import { api } from "../../lib/api";
import { HoldingModal } from "./HoldingModal";

const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;


/** Pull live market quotes into holdings' current prices. Prices also sync
 *  automatically in the background every few minutes — this shows freshness. */
function SyncPricesButton() {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const sync = useMutation({
    mutationFn: () => api.refreshPrices(),
    onSuccess: (r) => {
      const at = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setMsg(r.updated > 0 ? `● Live · updated ${at}` : "No symbols matched the market");
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      qc.invalidateQueries({ queryKey: ["networth"] });
    },
    onError: (e) => setMsg((e as Error).message),
  });
  useEffect(() => {
    sync.mutate(); // sync immediately when the page opens…
    const t = setInterval(() => sync.mutate(), 120_000); // …and keep it live while it's open
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="row gap-sm" style={{ alignItems: "center" }}>
      {msg && <span className="accent text-xs">{msg}</span>}
      <button className="btn btn-sm" onClick={() => sync.mutate()} disabled={sync.isPending} title="Prices update automatically every few minutes — click to refresh now">
        {sync.isPending ? <span className="ring" /> : "⟳ Refresh now"}
      </button>
    </div>
  );
}


/* ------------------------------------------------------------------ *
 * Backtesting: replay a monthly plan against real market history.
 * ------------------------------------------------------------------ */
const HISTORY_URL = "https://budgetsmart-api.budgetsmart.workers.dev/market/history";

async function fetchHistory(symbol: string, years: number) {
  const r = await fetch(`${HISTORY_URL}?symbol=${encodeURIComponent(symbol)}&years=${years}`);
  if (!r.ok) throw new Error(`No history found for ${symbol.toUpperCase()}`);
  return ((await r.json()) as { points: Array<{ month: string; close: number }> }).points;
}

function BacktestCard() {
  const thisYear = new Date().getUTCFullYear();
  const [symbol, setSymbol] = useState("SPY");
  const [compare, setCompare] = useState("");
  const [monthly, setMonthly] = useState("200");
  const [sinceYear, setSinceYear] = useState(thisYear - 8);
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    const cents = Math.round((parseFloat(monthly) || 0) * 100);
    if (!symbol.trim() || cents <= 0) return;
    setBusy(true); setErr(null);
    try {
      const years = thisYear - sinceYear + 1;
      const start = `${sinceYear}-01`;
      const symbols = [symbol.trim(), compare.trim()].filter(Boolean);
      const out: BacktestResult[] = [];
      for (const sym of symbols) {
        const closes = await fetchHistory(sym, years);
        const r = runBacktest(sym, closes, cents, start);
        if (!r) throw new Error(`Not enough history for ${sym.toUpperCase()} since ${sinceYear}`);
        out.push(r);
      }
      setResults(out);
    } catch (e) {
      setErr((e as Error).message);
      setResults([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <span className="card-title">⏪ Backtest — what if you'd invested?</span>
      <div className="row gap-sm wrap" style={{ marginTop: 12 }}>
        <input className="input btn-sm mono" style={{ width: 90, textTransform: "uppercase" }} value={symbol}
          onChange={(e) => setSymbol(e.target.value)} placeholder="SPY" title="Ticker (US stocks/ETFs, BTC, ETH)" />
        <div className="input-prefix" style={{ width: 100 }}>
          <span>$</span>
          <input className="input mono btn-sm" style={{ padding: "6px 8px 6px 22px", width: "100%" }} inputMode="decimal"
            value={monthly} onChange={(e) => setMonthly(e.target.value)} title="Monthly contribution" />
        </div>
        <span className="faint text-xs" style={{ alignSelf: "center" }}>/mo since</span>
        <select className="select btn-sm" style={{ width: 90 }} value={sinceYear} onChange={(e) => setSinceYear(Number(e.target.value))}>
          {[3, 5, 8, 10, 15].map((n) => (
            <option key={n} value={thisYear - n}>{thisYear - n}</option>
          ))}
        </select>
        <input className="input btn-sm mono" style={{ width: 110, textTransform: "uppercase" }} value={compare}
          onChange={(e) => setCompare(e.target.value)} placeholder="vs… (QQQ)" title="Optional second symbol to compare" />
        <button className="btn btn-primary btn-sm" onClick={run} disabled={busy}>{busy ? <span className="ring" /> : "Run backtest"}</button>
      </div>
      {err && <div className="text-xs" style={{ color: "var(--danger)", marginTop: 8 }}>{err}</div>}

      {results.length > 0 && (
        <div className="grid grid-2" style={{ marginTop: 14, gap: 14 }}>
          {results.map((r) => (
            <div key={r.symbol} className="col gap-sm" style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
              <div className="row between">
                <span className="text-sm" style={{ fontWeight: 600 }}>{r.symbol}</span>
                <span className="faint text-xs">{r.startMonth} → {r.endMonth}</span>
              </div>
              <BacktestChart points={r.points} />
              <div className="row between text-xs">
                <span className="faint">invested {formatMoney(r.invested)}</span>
                <span>now <Money cents={r.finalValue} className="text-xs" /></span>
                <span className={r.gain >= 0 ? "accent" : "danger"}>
                  {r.gain >= 0 ? "+" : ""}{formatMoney(r.gain)} ({(r.gainPct * 100).toFixed(1)}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="faint text-xs" style={{ marginTop: 10 }}>
        Monthly dollar-cost averaging at real historical closes. Past performance isn't a promise about the future.
      </div>
    </div>
  );
}

function BacktestChart({ points }: { points: BacktestPoint[] }) {
  if (points.length < 2) return null;
  const W = 320, H = 90, P = 4;
  const max = Math.max(...points.map((p) => Math.max(p.value, p.invested)), 1);
  const x = (i: number) => P + (i / (points.length - 1)) * (W - P * 2);
  const y = (v: number) => H - P - (v / max) * (H - P * 2);
  const line = (get: (p: BacktestPoint) => number) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(get(p)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Backtest chart">
      <path d={line((p) => p.invested)} fill="none" stroke="var(--fg-faint)" strokeWidth={1.5} strokeDasharray="4 3" />
      <path d={line((p) => p.value)} fill="none" stroke="var(--accent)" strokeWidth={2} />
    </svg>
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
      <BacktestCard />
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
