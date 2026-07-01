import { formatMoney, type NetWorthComponent, type NetWorthPoint } from "@budgetsmart/shared";
import { EmptyState, Money, Spinner } from "../../components/ui";
import { useNetWorth } from "../../lib/hooks";
import { monthAbbr } from "../../lib/format";

export function NetWorthPage() {
  const nwQ = useNetWorth();
  const detail = nwQ.data;

  if (nwQ.isLoading || !detail) {
    return (
      <div className="page">
        <Spinner label="Tallying your net worth…" />
      </div>
    );
  }

  const b = detail.breakdown;
  const assets = b.components.filter((c) => c.kind === "asset");
  const liabilities = b.components.filter((c) => c.kind === "liability");

  return (
    <div className="page">
      {/* headline */}
      <div className="card">
        <div className="row between wrap" style={{ gap: 16 }}>
          <div className="col">
            <span className="card-title">Total net worth</span>
            <span className="stat stat-xl" style={{ marginTop: 6 }}>
              <Money cents={b.net} colorize />
            </span>
          </div>
          <div className="row" style={{ gap: 28 }}>
            <Stat label="Assets" value={formatMoney(b.totalAssets)} tone="accent" />
            <Stat label="Liabilities" value={formatMoney(b.totalLiabilities)} tone="danger" />
            <Stat label="Debt / assets" value={`${Math.round(b.leverage * 100)}%`} />
          </div>
        </div>
      </div>

      <div className="grid grid-dash">
        {/* composition */}
        <div className="card">
          <span className="card-title">Composition</span>

          <div className="col gap-lg" style={{ marginTop: 16 }}>
            <CompositionBar title="Assets" total={b.totalAssets} parts={assets} />
            <CompositionBar title="Liabilities" total={b.totalLiabilities} parts={liabilities} />
          </div>

          <div className="divider" style={{ margin: "18px 0" }} />

          <div className="col gap-sm">
            {b.components.map((c) => (
              <div className="row between" key={c.key}>
                <div className="row gap-sm">
                  <span className="dot" style={{ background: c.color }} />
                  <span className="text-sm">{c.label}</span>
                  <span className={`badge text-xs ${c.kind === "asset" ? "accent" : "danger"}`}>
                    {c.kind}
                  </span>
                </div>
                <div className="row gap-sm">
                  <span className="num text-xs faint">{Math.round(c.share * 100)}%</span>
                  <Money cents={c.value} className="text-sm" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* history */}
        <div className="card">
          <div className="row between" style={{ marginBottom: 8 }}>
            <span className="card-title">12-month trend</span>
            <Money cents={b.net} colorize className="text-sm" />
          </div>
          {detail.history.length < 2 ? (
            <EmptyState title="Not enough history yet" />
          ) : (
            <NetWorthTrend data={detail.history} />
          )}
          <div className="faint text-xs" style={{ marginTop: 10 }}>
            Accounts move with activity; investments & debts held at today's value.
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "accent" | "danger" }) {
  return (
    <div className="col">
      <span className="label">{label}</span>
      <span className={`stat stat-lg ${tone ?? ""}`}>{value}</span>
    </div>
  );
}

function CompositionBar({ title, total, parts }: { title: string; total: number; parts: NetWorthComponent[] }) {
  return (
    <div className="col gap-sm">
      <div className="row between">
        <span className="text-xs faint">{title}</span>
        <span className="num text-sm">{formatMoney(total)}</span>
      </div>
      <div className="row" style={{ height: 12, borderRadius: 999, overflow: "hidden", background: "#161616" }}>
        {parts.map((p) => (
          <div
            key={p.key}
            title={`${p.label} ${formatMoney(p.value)}`}
            style={{ width: `${Math.max(2, p.share * 100)}%`, background: p.color, boxShadow: `0 0 8px ${p.color}66` }}
          />
        ))}
        {parts.length === 0 && <div className="faint text-xs" style={{ padding: "0 8px" }} />}
      </div>
    </div>
  );
}

function NetWorthTrend({ data }: { data: NetWorthPoint[] }) {
  const w = 720;
  const h = 150;
  const pad = 6;
  const vals = data.map((d) => d.net);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 1);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / span) * (h - pad * 2);

  const line = data.map((d, i) => `${x(i).toFixed(1)},${y(d.net).toFixed(1)}`).join(" ");
  const area = `${x(0).toFixed(1)},${h - pad} ${line} ${x(data.length - 1).toFixed(1)},${h - pad}`;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
        <defs>
          <linearGradient id="nwTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00FF41" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#00FF41" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#nwTrendFill)" />
        <polyline points={line} fill="none" stroke="#00FF41" strokeWidth="2" style={{ filter: "drop-shadow(0 0 4px rgba(0,255,65,.6))" }} />
        {data.map((d, i) => (
          <circle key={d.month} cx={x(i)} cy={y(d.net)} r="2.5" fill="#000" stroke="#00FF41" strokeWidth="1.5" />
        ))}
      </svg>
      <div className="row between" style={{ marginTop: 4 }}>
        <span className="faint text-xs">{monthAbbr(data[0]!.month)}</span>
        <span className="faint text-xs">{monthAbbr(data[data.length - 1]!.month)}</span>
      </div>
    </div>
  );
}
