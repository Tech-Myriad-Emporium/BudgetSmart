import {
  analyzeCreditCard,
  formatMoney,
  parseMoney,
  type CreditCardScenario,
  type UtilizationBand,
} from "@budgetsmart/shared";
import { useMemo, useState } from "react";
import { Field, Money } from "../../components/ui";
import { formatDateShort } from "../../lib/format";

const BAND_META: Record<UtilizationBand, { label: string; cls: string }> = {
  excellent: { label: "Excellent", cls: "accent" },
  good: { label: "Good", cls: "accent" },
  fair: { label: "Fair", cls: "warn" },
  high: { label: "High", cls: "danger" },
  maxed: { label: "Maxed out", cls: "danger" },
};

const fmtMonths = (m: number) => {
  const y = Math.floor(m / 12);
  const mo = m % 12;
  return [y ? `${y}y` : "", mo ? `${mo}mo` : ""].filter(Boolean).join(" ") || "0mo";
};

export function CreditCardCalculator() {
  const [balanceText, setBalanceText] = useState("5000");
  const [aprText, setAprText] = useState("22.99");
  const [limitText, setLimitText] = useState("10000");
  const [scoreText, setScoreText] = useState("");

  const analysis = useMemo(() => {
    const balance = parseMoney(balanceText) ?? 0;
    const aprBps = Math.round((Number(aprText.replace(/[^0-9.]/g, "")) || 0) * 100);
    const creditLimit = parseMoney(limitText) ?? 0;
    const parsedScore = parseInt(scoreText.replace(/\D/g, ""), 10);
    const currentScore = Number.isFinite(parsedScore) && parsedScore >= 300 && parsedScore <= 850 ? parsedScore : undefined;
    if (balance <= 0) return null;
    return analyzeCreditCard({ balance, aprBps, creditLimit, currentScore });
  }, [balanceText, aprText, limitText, scoreText]);

  const band = analysis ? BAND_META[analysis.credit.band] : null;

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 4 }}>
        <span className="card-title">💳 Credit card calculator</span>
        <span className="faint text-xs">payments · interest · credit impact</span>
      </div>
      <div className="faint text-xs" style={{ marginBottom: 16 }}>
        See what your card really costs and the smartest way to pay it down.
      </div>

      {/* inputs */}
      <div className="grid grid-2" style={{ gap: 12, marginBottom: 18 }}>
        <Field label="Balance">
          <div className="input-prefix">
            <span>$</span>
            <input className="input mono" inputMode="decimal" value={balanceText} onChange={(e) => setBalanceText(e.target.value)} />
          </div>
        </Field>
        <Field label="APR %" hint="annual rate">
          <input className="input mono" inputMode="decimal" value={aprText} onChange={(e) => setAprText(e.target.value)} />
        </Field>
        <Field label="Credit limit" hint="for utilization">
          <div className="input-prefix">
            <span>$</span>
            <input className="input mono" inputMode="decimal" value={limitText} onChange={(e) => setLimitText(e.target.value)} />
          </div>
        </Field>
        <Field label="Current credit score" hint="300–850 · optional">
          <input className="input mono" inputMode="numeric" maxLength={3} placeholder="e.g. 680" value={scoreText} onChange={(e) => setScoreText(e.target.value)} />
        </Field>
      </div>

      {!analysis ? (
        <span className="faint text-sm">Enter a balance to see the breakdown.</span>
      ) : (
        <>
          {/* headline numbers */}
          <div className="grid grid-3" style={{ marginBottom: 18 }}>
            <Stat label="Minimum payment" value={formatMoney(analysis.minimumPayment)} sub="this month" />
            <Stat label="Interest / month" value={formatMoney(analysis.monthlyInterest)} sub={`at ${(analysis.aprBps / 100).toFixed(2)}% APR`} tone="danger" />
            <Stat label="Interest saved" value={formatMoney(analysis.interestSavedVsMin)} sub={`& ${fmtMonths(analysis.monthsSavedVsMin)} faster`} tone="accent" />
          </div>

          {/* scenarios */}
          <span className="label">Payment scenarios</span>
          <div className="ledger" style={{ margin: "8px 0 18px" }}>
            {analysis.scenarios.map((s) => (
              <ScenarioRow key={s.key} s={s} recommended={s.key === analysis.recommended.key} />
            ))}
          </div>

          {/* credit utilization */}
          <span className="label">Potential credit gains</span>
          <div className="card" style={{ background: "var(--input-bg)", marginTop: 8 }}>
            <div className="row between wrap" style={{ gap: 12 }}>
              <div className="col">
                <span className="faint text-xs">Current utilization</span>
                <div className="row gap-sm" style={{ alignItems: "baseline" }}>
                  <span className={`stat stat-lg ${band!.cls}`}>{Math.round(analysis.credit.currentUtilization * 100)}%</span>
                  <span className={`badge ${band!.cls}`}>{band!.label}</span>
                </div>
              </div>
              <div className="col" style={{ alignItems: "center" }}>
                <span className="faint text-xs">{analysis.credit.scoreAssumed ? "Assumed score" : "Your score"}</span>
                <span className="stat stat-lg">{analysis.credit.currentScore}</span>
              </div>
              <div className="col" style={{ alignItems: "flex-end" }}>
                <span className="faint text-xs">Pay to ~10% util → est.</span>
                <div className="row gap-sm" style={{ alignItems: "baseline" }}>
                  <span className="stat stat-lg accent">{analysis.credit.projectedScore}</span>
                  {analysis.credit.estimatedScoreGain > 0 && (
                    <span className="badge accent">+{analysis.credit.estimatedScoreGain} pts</span>
                  )}
                </div>
              </div>
            </div>
            <div className="divider" style={{ margin: "14px 0" }} />
            <div className="row between text-xs">
              <span className="muted">
                Pay below <Money cents={analysis.credit.healthyBalance} className="text-xs accent" /> → under 30% (healthy)
              </span>
              <span className="muted">
                Below <Money cents={analysis.credit.excellentBalance} className="text-xs accent" /> → under 10% (excellent)
              </span>
            </div>
            <div className="faint text-xs" style={{ marginTop: 10 }}>
              {analysis.credit.scoreAssumed
                ? "Enter your real score above for a personalized estimate (we assumed 680, the US middle). "
                : ""}
              Utilization is ~30% of a FICO score, and the gain depends on where you start — lower scores have more room to
              recover than scores already near the top. Estimate is illustrative, not a guarantee.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "accent" | "danger" }) {
  return (
    <div className="col">
      <span className="label">{label}</span>
      <span className={`stat stat-lg ${tone ?? ""}`} style={{ marginTop: 4 }}>{value}</span>
      {sub && <span className="faint text-xs">{sub}</span>}
    </div>
  );
}

function ScenarioRow({ s, recommended }: { s: CreditCardScenario; recommended: boolean }) {
  return (
    <div className="ledger-row" style={{ gridTemplateColumns: "1fr auto" }}>
      <div className="col" style={{ minWidth: 0 }}>
        <div className="row gap-sm">
          <span className="text-sm">{s.label}</span>
          {recommended && <span className="badge accent text-xs">best</span>}
          {!s.viable && <span className="badge danger text-xs">never pays off</span>}
        </div>
        <span className="faint text-xs">
          {formatMoney(s.monthlyPayment)}/mo · {s.viable ? `${fmtMonths(s.months)} · clears ${s.payoffDate ? formatDateShort(s.payoffDate) : "—"}` : "50yr+ at this rate"}
        </span>
      </div>
      <div className="col" style={{ alignItems: "flex-end" }}>
        <span className="faint text-xs">interest</span>
        <Money cents={s.totalInterest} className={`text-sm ${s.key === "minimum" ? "danger" : ""}`} />
      </div>
    </div>
  );
}
