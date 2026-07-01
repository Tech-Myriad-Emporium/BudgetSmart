import { formatMoneyCompact, type CategorySpend } from "@budgetsmart/shared";

/**
 * Donut chart for category spend. Pure SVG, neon stroke segments on a black core.
 */
export function SpendDonut({ data, total }: { data: CategorySpend[]; total: number }) {
  const size = 168;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const c = 2 * Math.PI * r;

  let offset = 0;
  const segments = data.slice(0, 8).map((d) => {
    const len = d.share * c;
    const seg = { color: d.color, dash: len, gap: c - len, offset: -offset };
    offset += len;
    return seg;
  });

  return (
    <div className="row" style={{ gap: 20, alignItems: "center", flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flex: "none" }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#161616" strokeWidth={stroke} />
        <g transform={`rotate(-90 ${cx} ${cx})`}>
          {segments.map((s, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${s.dash} ${s.gap}`}
              strokeDashoffset={s.offset}
              style={{ transition: "stroke-dasharray .4s cubic-bezier(.4,0,.2,1)" }}
            />
          ))}
        </g>
        <text x={cx} y={cx - 4} textAnchor="middle" className="num" fill="#fff" fontSize="18" fontWeight="600">
          {formatMoneyCompact(total)}
        </text>
        <text x={cx} y={cx + 14} textAnchor="middle" fill="#5a5a5a" fontSize="9" letterSpacing="1">
          SPENT
        </text>
      </svg>

      <div className="col grow gap-sm" style={{ minWidth: 160 }}>
        {data.slice(0, 6).map((d) => (
          <div className="row between" key={d.categoryId ?? d.categoryName}>
            <div className="row gap-sm" style={{ gap: 8 }}>
              <span className="dot" style={{ background: d.color }} />
              <span className="text-sm muted truncate" style={{ maxWidth: 130 }}>
                {d.icon} {d.categoryName}
              </span>
            </div>
            <span className="num text-sm">{Math.round(d.share * 100)}%</span>
          </div>
        ))}
        {data.length === 0 && <span className="faint text-sm">No spending yet this month.</span>}
      </div>
    </div>
  );
}

/** Simple two-bar income-vs-expense comparison. */
export function CashflowBars({ income, expenses }: { income: number; expenses: number }) {
  const max = Math.max(income, expenses, 1);
  const bar = (value: number, color: string, label: string) => (
    <div className="col gap-sm grow">
      <div className="row between">
        <span className="text-xs faint">{label}</span>
        <span className="num text-sm">{formatMoneyCompact(value)}</span>
      </div>
      <div className="progress" style={{ height: 10 }}>
        <span style={{ width: `${(value / max) * 100}%`, background: color, boxShadow: `0 0 12px ${color}66` }} />
      </div>
    </div>
  );
  return (
    <div className="col gap-lg">
      {bar(income, "#00FF41", "Income")}
      {bar(expenses, "#FF0033", "Expenses")}
    </div>
  );
}
