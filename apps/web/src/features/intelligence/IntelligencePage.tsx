import { formatMoney } from "@budgetsmart/shared";
import { useState } from "react";
import { Money, Spinner } from "../../components/ui";
import { useIntelligence } from "../../lib/hooks";
import { formatDateShort } from "../../lib/format";

export function IntelligencePage() {
  const [matchForm, setMatchForm] = useState({ salary: "", contribPct: "4", matchPct: "100", matchCapPct: "5" });
  const [matchParams, setMatchParams] = useState<{ salary: number; contribPct: number; matchPct: number; matchCapPct: number } | undefined>();
  const intelQ = useIntelligence(matchParams);
  const data = intelQ.data;

  if (intelQ.isLoading || !data) {
    return (
      <div className="page">
        <Spinner label="Running the numbers…" />
      </div>
    );
  }

  const t = data.tax;
  const withholdLabel =
    t.withholdingStatus === "under" ? "⚠ under-withholding" :
    t.withholdingStatus === "over" ? "over-withholding" :
    t.withholdingStatus === "on-track" ? "on track" : "no withholding data";

  return (
    <div className="page">
      <p className="faint text-xs" style={{ margin: 0 }}>
        Estimates from your local data (US federal, single filer, standard deduction) — not tax or investment advice.
      </p>

      {/* ============ TAX ============ */}
      <div className="grid grid-3">
        <div className="card">
          <span className="card-title">Estimated {t.year} federal tax</span>
          <div className="stat stat-xl danger" style={{ marginTop: 10 }}>
            <Money cents={t.estimatedTax} />
          </div>
          <div className="faint text-xs" style={{ marginTop: 8 }}>
            {Math.round(t.effectiveRate * 100)}% effective · {Math.round(t.marginalRate * 100)}% marginal
          </div>
        </div>
        <div className="card">
          <span className="card-title">Set aside monthly</span>
          <div className="stat stat-xl warn" style={{ marginTop: 10 }}>
            <Money cents={t.monthlySetAside} />
          </div>
          <div className="faint text-xs" style={{ marginTop: 8 }}>
            on annualized income of {formatMoney(t.annualizedIncome)}
          </div>
        </div>
        <div className="card">
          <span className="card-title">Withholding</span>
          <div className={`stat stat-xl ${t.withholdingStatus === "under" ? "danger" : "accent"}`} style={{ marginTop: 10 }}>
            <Money cents={t.withheldYtd} />
          </div>
          <div className="faint text-xs" style={{ marginTop: 8 }}>{withholdLabel}</div>
        </div>
      </div>

      <div className="grid grid-dash">
        <div className="col gap-md">
          {/* quarterly */}
          <div className="card">
            <span className="card-title">📅 Quarterly estimated payments</span>
            <div className="col" style={{ marginTop: 12 }}>
              {t.quarterly.map((q) => (
                <div className="row between" key={q.due} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", opacity: q.passed ? 0.5 : 1 }}>
                  <span className="text-sm">{formatDateShort(q.due)}{q.passed ? " · passed" : ""}</span>
                  <Money cents={q.amount} className="text-sm" />
                </div>
              ))}
            </div>
          </div>

          {/* capital gains */}
          <div className="card">
            <span className="card-title">📈 Capital gains (unrealized)</span>
            <div className="col" style={{ marginTop: 12 }}>
              <Row label="Long-term (held 1y+)" value={t.gains.longTerm} />
              <Row label="Short-term" value={t.gains.shortTerm} />
              <Row label="Est. tax if sold today" value={t.gains.estimatedTaxIfSold} danger />
            </div>
          </div>

          {/* deductions */}
          <div className="card">
            <span className="card-title">🧾 Deduction finder · {t.year}</span>
            <div className="col" style={{ marginTop: 12 }}>
              {t.deductions.length === 0 ? (
                <span className="faint text-sm">Tag transactions (donation, medical…) and they'll be tracked here.</span>
              ) : (
                t.deductions.map((d) => <Row key={d.group} label={`${d.icon} ${d.group}`} value={d.total} />)
              )}
              {t.deductions.length > 0 && (
                <p className={`text-xs ${t.itemizeHint ? "accent" : "faint"}`} style={{ marginTop: 8 }}>
                  {t.itemizeHint
                    ? `On pace to beat the ${formatMoney(t.standardDeduction)} standard deduction — itemizing may pay off.`
                    : `Standard deduction (${formatMoney(t.standardDeduction)}) still wins at this pace.`}
                </p>
              )}
            </div>
          </div>

          {/* anomalies */}
          {t.anomalies.length > 0 && (
            <div className="card">
              <span className="card-title">🚨 Paycheck anomalies</span>
              <div className="col" style={{ marginTop: 12 }}>
                {t.anomalies.map((a) => (
                  <div className="row between" key={`${a.merchant}-${a.date}`} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <div className="col" style={{ minWidth: 0 }}>
                      <span className="text-sm truncate">{a.merchant}</span>
                      <span className="warn text-xs">{formatDateShort(a.date)} · usually {formatMoney(a.typical)}</span>
                    </div>
                    <Money cents={a.amount} className="text-sm" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* debt IQ */}
          <div className="card">
            <span className="card-title">💳 Debt intelligence</span>
            <div className="col" style={{ marginTop: 12 }}>
              {data.debt.bnpl.length === 0 && data.debt.refinance.length === 0 && data.debt.promoRisks.length === 0 && (
                <span className="faint text-sm">No BNPL plans, promo APRs or refinancing wins detected.</span>
              )}
              {data.debt.bnpl.map((b) => (
                <div className="row between" key={`${b.merchant}-${b.installment}`} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <div className="col" style={{ minWidth: 0 }}>
                    <span className="text-sm truncate">🛍 {b.merchant}</span>
                    <span className="faint text-xs">BNPL · {b.paid} paid · next {formatDateShort(b.nextDue)}</span>
                  </div>
                  <Money cents={b.installment} className="text-sm" />
                </div>
              ))}
              {data.debt.refinance.map((r) => (
                <div className="row between" key={r.debtId} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <div className="col" style={{ minWidth: 0 }}>
                    <span className="text-sm truncate">{r.icon} Refinance {r.name}</span>
                    <span className="faint text-xs">
                      {(r.aprBps / 100).toFixed(1)}% → {(r.refiAprBps / 100).toFixed(1)}% APR
                    </span>
                  </div>
                  <span className="accent text-sm">save {formatMoney(r.annualSavings)}/yr</span>
                </div>
              ))}
              {data.debt.promoRisks.map((p) => (
                <div className="row between" key={p.debtId} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <div className="col" style={{ minWidth: 0 }}>
                    <span className="text-sm truncate">{p.icon} {p.name}</span>
                    <span className="warn text-xs">
                      {(p.aprBps / 100).toFixed(1)}% APR looks promotional — check when it expires
                    </span>
                  </div>
                  <Money cents={p.balance} className="text-sm" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col gap-md">
          {/* invest IQ */}
          <div className="card">
            <span className="card-title">📊 Investment intelligence</span>
            <div className="col" style={{ marginTop: 12 }}>
              <Row label="Estimated annual fund fees" value={data.invest.totalAnnualFees} danger={data.invest.totalAnnualFees > 10000} />
              {data.invest.fees.slice(0, 4).map((f) => (
                <div className="row between" key={f.holdingId} style={{ padding: "6px 0" }}>
                  <span className="faint text-xs">{f.symbol || f.name} · ~{(f.estRatioBps / 100).toFixed(2)}%</span>
                  <span className="faint text-xs">{formatMoney(f.annualFee)}/yr · {formatMoney(f.drag20y)} drag over 20y</span>
                </div>
              ))}
              {data.invest.rebalance.length > 0 && (
                <>
                  <div className="divider" style={{ margin: "10px 0" }} />
                  {data.invest.rebalance.map((r) => (
                    <div className="row between" key={r.assetClass} style={{ padding: "6px 0" }}>
                      <span className="text-sm" style={{ textTransform: "capitalize" }}>{r.label}</span>
                      <span className={`text-xs ${r.action === "trim" ? "warn" : "accent"}`}>
                        {Math.round(r.currentShare * 100)}% vs {Math.round(r.targetShare * 100)}% target → {r.action}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* employer match */}
          <div className="card">
            <span className="card-title">🎁 Employer match check</span>
            <div className="row gap-sm" style={{ marginTop: 12, flexWrap: "wrap" }}>
              <input className="input" style={{ width: 110 }} placeholder="Salary $" inputMode="numeric" value={matchForm.salary}
                onChange={(e) => setMatchForm({ ...matchForm, salary: e.target.value.replace(/[^\d]/g, "") })} />
              <input className="input" style={{ width: 90 }} placeholder="You %" inputMode="decimal" value={matchForm.contribPct}
                onChange={(e) => setMatchForm({ ...matchForm, contribPct: e.target.value })} />
              <input className="input" style={{ width: 90 }} placeholder="Match %" inputMode="decimal" value={matchForm.matchPct}
                onChange={(e) => setMatchForm({ ...matchForm, matchPct: e.target.value })} />
              <input className="input" style={{ width: 90 }} placeholder="Cap %" inputMode="decimal" value={matchForm.matchCapPct}
                onChange={(e) => setMatchForm({ ...matchForm, matchCapPct: e.target.value })} />
              <button
                className="btn btn-sm"
                onClick={() =>
                  setMatchParams({
                    salary: Number(matchForm.salary) || 0,
                    contribPct: Number(matchForm.contribPct) || 0,
                    matchPct: Number(matchForm.matchPct) || 100,
                    matchCapPct: Number(matchForm.matchCapPct) || 4,
                  })
                }
              >
                Check
              </button>
            </div>
            {data.invest.match && (
              <p className={`text-sm ${data.invest.match.missedMatch > 0 ? "danger" : "accent"}`} style={{ marginTop: 10 }}>
                {data.invest.match.missedMatch > 0
                  ? `You're leaving ${formatMoney(data.invest.match.missedMatch)}/yr of free money on the table — raise your contribution to ${data.invest.match.matchCapPct}%.`
                  : "✓ You're capturing the full employer match."}
              </p>
            )}
          </div>

          {/* opportunity cost */}
          <div className="card">
            <span className="card-title">⚖️ Opportunity cost of $100/mo</span>
            <div className="col" style={{ marginTop: 12 }}>
              {data.opportunity.map((o) => (
                <Row key={o.years} label={`${o.years} years @ 7%`} value={o.futureValue} accent />
              ))}
            </div>
          </div>

          {/* negotiation scripts */}
          {data.negotiation.length > 0 && (
            <div className="card">
              <span className="card-title">📞 Negotiation scripts</span>
              <div className="col" style={{ marginTop: 12 }}>
                {data.negotiation.map((n) => (
                  <details key={n.merchant} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <summary className="text-sm" style={{ cursor: "pointer" }}>
                      {n.merchant} · {formatMoney(n.monthlyCost)}/mo
                    </summary>
                    <p className="faint text-xs" style={{ margin: "8px 0" }}>{n.script}</p>
                    <button className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(n.script)}>Copy script</button>
                  </details>
                ))}
              </div>
            </div>
          )}

          {/* impulse guard */}
          <div className="card">
            <span className="card-title">🛡 Impulse guard · last 30 days</span>
            <div className="col" style={{ marginTop: 12 }}>
              {data.impulse.purchases.length === 0 ? (
                <span className="faint text-sm">No unusually large discretionary purchases. 💪</span>
              ) : (
                <>
                  {data.impulse.purchases.slice(0, 5).map((p) => (
                    <div className="row between" key={p.transactionId} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                      <div className="col" style={{ minWidth: 0 }}>
                        <span className="text-sm truncate">{p.merchant}</span>
                        <span className="faint text-xs">{formatDateShort(p.date)} · {p.categoryName}</span>
                      </div>
                      <Money cents={p.amount} className="text-sm" />
                    </div>
                  ))}
                  <p className="warn text-xs" style={{ marginTop: 8 }}>
                    {formatMoney(data.impulse.total30d)} in large discretionary buys. Try a 48-hour rule: add it to a wishlist first — most urges fade.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* long range */}
          <div className="card">
            <span className="card-title">🔮 Long-range projection</span>
            <p className="faint text-xs" style={{ margin: "8px 0 4px" }}>
              Portfolio + monthly surplus, compounding at 7%.
            </p>
            <div className="col">
              {data.longRange.map((l) => (
                <Row key={l.years} label={`In ${l.years} year${l.years === 1 ? "" : "s"}`} value={l.projected} accent />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, danger, accent }: { label: string; value: number; danger?: boolean; accent?: boolean }) {
  return (
    <div className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      <span className="text-sm">{label}</span>
      <Money cents={value} className={`text-sm ${danger ? "danger" : accent ? "accent" : ""}`} />
    </div>
  );
}
