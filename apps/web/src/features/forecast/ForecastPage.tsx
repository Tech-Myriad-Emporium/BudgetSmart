import { formatMoney } from "@budgetsmart/shared";
import { Link } from "react-router-dom";
import { EmptyState, Money, Spinner } from "../../components/ui";
import { useForecast } from "../../lib/hooks";
import { formatDateShort } from "../../lib/format";

export function ForecastPage() {
  const forecastQ = useForecast();
  const data = forecastQ.data;

  if (forecastQ.isLoading) {
    return (
      <div className="page">
        <Spinner label="Projecting your cashflow…" />
      </div>
    );
  }

  // Never spin forever: a failed request gets a real message and a retry.
  if (forecastQ.isError || !data) {
    return (
      <div className="page">
        <div className="card">
          <EmptyState
            icon="◠"
            title="Couldn't build your forecast"
            hint={(forecastQ.error as Error | undefined)?.message ?? "Something went wrong loading your data."}
          />
          <div className="row" style={{ justifyContent: "center", paddingBottom: 16 }}>
            <button className="btn btn-primary" onClick={() => forecastQ.refetch()}>Try again</button>
          </div>
        </div>
      </div>
    );
  }

  // Brand-new data: nothing to project yet — say so instead of a dead flat line.
  const noSignal =
    data.startBalance === 0 && data.dailyDiscretionary === 0 && data.incomeStreams.length === 0 &&
    data.points.every((p) => p.balance === data.startBalance);
  if (noSignal) {
    return (
      <div className="page">
        <div className="card">
          <EmptyState
            icon="◠"
            title="Your forecast needs a little fuel"
            hint="Add an account with a balance, then either import some transactions or schedule your bills and paychecks — the 90-day projection lights up from there."
          />
          <div className="row gap-sm" style={{ justifyContent: "center", paddingBottom: 16 }}>
            <Link className="btn btn-primary" to="/accounts">Add an account</Link>
            <Link className="btn" to="/calendar">Schedule charges</Link>
            <Link className="btn" to="/import">Import a statement</Link>
          </div>
        </div>
      </div>
    );
  }

  const risky = data.shortfallDate !== null;

  return (
    <div className="page">
      {/* headline stats */}
      <div className="grid grid-3">
        <div className="card">
          <span className="card-title">In {data.horizonDays} days</span>
          <div className={`stat stat-xl ${data.endBalance < data.startBalance ? "danger" : "accent"}`} style={{ marginTop: 10 }}>
            <Money cents={data.endBalance} />
          </div>
          <div className="faint text-xs" style={{ marginTop: 8 }}>
            from <Money cents={data.startBalance} className="text-xs" /> today
          </div>
        </div>
        <div className="card">
          <span className="card-title">Lowest point</span>
          <div className={`stat stat-xl ${data.minBalance < 0 ? "danger" : ""}`} style={{ marginTop: 10 }}>
            <Money cents={data.minBalance} />
          </div>
          <div className={`text-xs ${risky ? "danger" : "faint"}`} style={{ marginTop: 8 }}>
            {risky ? `⚠ goes negative ${formatDateShort(data.shortfallDate!)}` : `on ${formatDateShort(data.minDate)}`}
          </div>
        </div>
        <div className="card">
          <span className="card-title">Safe daily pace</span>
          <div className="stat stat-xl accent" style={{ marginTop: 10 }}>
            {data.pacing.dailyAllowance !== null ? <Money cents={data.pacing.dailyAllowance} /> : "—"}
          </div>
          <div className="faint text-xs" style={{ marginTop: 8 }}>
            {data.pacing.nextPayday
              ? `until payday ${formatDateShort(data.pacing.nextPayday)} (${data.pacing.daysUntilPayday}d)`
              : "add 2+ paychecks to unlock pacing"}
          </div>
        </div>
      </div>

      {/* projection chart */}
      <div className="card">
        <div className="row between">
          <span className="card-title">90-day balance projection</span>
          <span className="faint text-xs">
            bills + income + {formatMoney(data.dailyDiscretionary)}/day typical spending
          </span>
        </div>
        <ForecastChart points={data.points} />
      </div>

      <div className="grid grid-dash">
        <div className="col gap-md">
          {/* advice feed */}
          <div className="card">
            <span className="card-title">🤖 AI Budget Advisor</span>
            <div className="col" style={{ marginTop: 12 }}>
              {data.advice.length === 0 ? (
                <EmptyState icon="✅" title="No warnings" hint="Your cashflow looks steady — keep it up." />
              ) : (
                data.advice.map((a) => (
                  <div key={a.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                    <div className="row between">
                      <span className="text-sm">{a.icon} {a.title}</span>
                      {a.impactMonthly !== undefined && (
                        <span className="accent text-xs">{formatMoney(a.impactMonthly)}/mo</span>
                      )}
                    </div>
                    <p className="faint text-xs" style={{ margin: "4px 0 0" }}>{a.body}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* income streams */}
          {data.incomeStreams.length > 0 && (
            <div className="card">
              <span className="card-title">💵 Detected income</span>
              <div className="col" style={{ marginTop: 12 }}>
                {data.incomeStreams.map((s) => (
                  <div className="row between" key={s.merchant} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                    <div className="col" style={{ minWidth: 0 }}>
                      <span className="text-sm truncate">{s.merchant}</span>
                      <span className="faint text-xs">every ~{s.intervalDays}d · next {formatDateShort(s.nextDate)}</span>
                    </div>
                    <Money cents={s.typicalAmount} className="text-sm accent" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="col gap-md">
          {/* sinking funds */}
          <div className="card">
            <span className="card-title">🏦 Sinking funds</span>
            <p className="faint text-xs" style={{ margin: "8px 0 4px" }}>
              Set aside a little monthly so annual bills never sting.
            </p>
            <div className="col">
              {data.sinkingFunds.length === 0 ? (
                <span className="faint text-sm" style={{ padding: "8px 0" }}>No annual bills detected yet.</span>
              ) : (
                data.sinkingFunds.map((f) => (
                  <div className="row between" key={f.merchant} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                    <div className="row gap-sm" style={{ minWidth: 0 }}>
                      <span className="cat-icon" style={{ width: 30, height: 30, borderColor: f.color, fontSize: 14 }}>{f.icon}</span>
                      <div className="col" style={{ minWidth: 0 }}>
                        <span className="text-sm truncate">{f.merchant}</span>
                        <span className="faint text-xs">{formatMoney(f.annualAmount)}/yr · due {formatDateShort(f.nextDue)}</span>
                      </div>
                    </div>
                    <span className="accent text-sm">{formatMoney(f.monthlySetAside)}/mo</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* sneaky expenses */}
          <div className="card">
            <span className="card-title">🕵️ Sneaky increases</span>
            <div className="col" style={{ marginTop: 12 }}>
              {data.sneaky.length === 0 ? (
                <span className="faint text-sm">No creeping bills found — nice.</span>
              ) : (
                data.sneaky.map((s) => (
                  <div className="row between" key={s.merchant} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                    <div className="col" style={{ minWidth: 0 }}>
                      <span className="text-sm truncate">{s.merchant}</span>
                      <span className="warn text-xs">
                        {formatMoney(s.earlierAmount)} → {formatMoney(s.latestAmount)} (+{Math.round(s.increasePct * 100)}%)
                      </span>
                    </div>
                    <span className="danger text-sm">+{formatMoney(s.monthlyImpact)}/mo</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* savings rate */}
          <div className="card">
            <span className="card-title">Savings rate · last 3 months</span>
            <div className={`stat stat-xl ${data.savingsRate !== null && data.savingsRate < 0.1 ? "warn" : "accent"}`} style={{ marginTop: 10 }}>
              {data.savingsRate === null ? "—" : `${Math.round(data.savingsRate * 100)}%`}
            </div>
            <div className="faint text-xs" style={{ marginTop: 8 }}>of income kept (15–20% is a healthy target)</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Lightweight inline SVG area chart of the projection. */
function ForecastChart({ points }: { points: Array<{ date: string; balance: number }> }) {
  if (points.length < 2) return null;
  const W = 720;
  const H = 160;
  const PAD = 8;
  const values = points.map((p) => p.balance);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / range) * (H - PAD * 2);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(" ");
  const zeroY = y(0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", marginTop: 12 }} role="img" aria-label="Balance projection chart">
      {min < 0 && (
        <rect x={0} y={zeroY} width={W} height={H - zeroY} fill="rgba(255,60,60,0.08)" />
      )}
      <line x1={0} x2={W} y1={zeroY} y2={zeroY} stroke="var(--border)" strokeDasharray="4 4" />
      <path d={`${path} L${x(points.length - 1)},${H - PAD} L${x(0)},${H - PAD} Z`} style={{ fill: "var(--accent-wash)" }} stroke="none" />
      <path d={path} fill="none" strokeWidth={2} style={{ stroke: "var(--accent)" }} />
    </svg>
  );
}
