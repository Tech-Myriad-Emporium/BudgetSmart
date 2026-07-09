// First-run setup: a shadowed, step-by-step walkthrough over the REAL app.
// Instead of slides, the user actually does the three things that matter —
// adds their first account, starts a $100 goal, and unlocks Rewards with a
// level-up. Written in plain language for people who were never taught money.
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

type StepKey = "welcome" | "account" | "goal" | "levelup";
const STEP_ORDER: StepKey[] = ["welcome", "account", "goal", "levelup"];

/** Sidebar target to spotlight per step (data-tour attribute on the nav). */
const SPOTLIGHT: Partial<Record<StepKey, string>> = {
  account: "/accounts",
  goal: "/goals",
  levelup: "/rewards",
};

function useSpotlightRect(step: StepKey): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    const target = SPOTLIGHT[step];
    if (!target) {
      setRect(null);
      return;
    }
    const measure = () => {
      const el = document.querySelector(`[data-tour="${target}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener("resize", measure);
    const t = setInterval(measure, 500); // layout can shift as queries load
    return () => {
      window.removeEventListener("resize", measure);
      clearInterval(t);
    };
  }, [step]);
  return rect;
}

export function GuidedOnboarding({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<StepKey>("welcome");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // step: account
  const [acctName, setAcctName] = useState("My Checking");
  const [acctType, setAcctType] = useState("checking");
  const [acctBalance, setAcctBalance] = useState("");

  // step: goal
  const [goalName, setGoalName] = useState("My first $100");

  const rect = useSpotlightRect(step);
  const stepIndex = STEP_ORDER.indexOf(step);

  async function addAccount() {
    setErr(null);
    const cents = Math.round((parseFloat(acctBalance.replace(/[^0-9.\-]/g, "")) || 0) * 100);
    if (!acctName.trim()) { setErr("Give the account a name — anything works."); return; }
    setBusy(true);
    try {
      await api.createAccount({ name: acctName.trim(), type: acctType, openingBalance: cents });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setStep("goal");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addGoal() {
    setErr(null);
    setBusy(true);
    try {
      await api.createGoal({
        name: goalName.trim() || "My first $100",
        type: "savings",
        icon: "💰",
        color: "#00c853",
        targetAmount: 10_000,
      });
      qc.invalidateQueries({ queryKey: ["goals"] });
      setStep("levelup");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    try { await api.completeOnboarding(); } catch { /* offline — let them in anyway */ }
    onDone();
  }

  // Card placement: beside the spotlighted nav item when there is one.
  const cardStyle = useMemo<React.CSSProperties>(() => {
    if (!rect) return {}; // centered via flexbox
    const top = Math.max(16, Math.min(rect.top - 40, window.innerHeight - 380));
    const left = rect.right + 18;
    if (left + 400 > window.innerWidth) return {}; // narrow screens: center it
    return { position: "absolute", top, left, margin: 0 };
  }, [rect]);

  return (
    <div className="guide-overlay">
      {/* the shadow with a bright cutout over the tab we're talking about */}
      {rect && (
        <div
          className="guide-spotlight"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}

      <div className="tour-card guide-card" style={cardStyle}>
        {step === "welcome" && (
          <>
            <img src="/brand.png" alt="BudgetSmart" style={{ height: 36, width: "auto", marginBottom: 14 }} />
            <div className="tour-icon">👋</div>
            <h2 className="tour-title">Let's set you up. It takes a minute.</h2>
            <p className="tour-body">
              No money-speak, promise. We'll do three things together: tell the app where your money
              lives, give it one small job, and grab your first reward. That's it.
            </p>
            <button className="btn btn-primary btn-block" onClick={() => setStep("account")}>Let's go →</button>
          </>
        )}

        {step === "account" && (
          <>
            <div className="tour-icon">🏦</div>
            <h2 className="tour-title">Step 1 · Where does your money live?</h2>
            <p className="tour-body" style={{ minHeight: 0 }}>
              An <b>account</b> is just a bucket that holds money — your checking, your savings, or the
              cash in your pocket. Add your main one. Don't know the exact balance? A rough guess is fine —
              you can fix it any time.
            </p>
            <div className="col" style={{ gap: 10, textAlign: "left", marginTop: 6 }}>
              <input className="input" value={acctName} onChange={(e) => setAcctName(e.target.value)} placeholder="What do you call it? (e.g. My Checking)" />
              <div className="row gap-sm">
                <select className="select" value={acctType} onChange={(e) => setAcctType(e.target.value)} style={{ flex: 1 }}>
                  <option value="checking">Checking — everyday spending</option>
                  <option value="savings">Savings — money set aside</option>
                  <option value="cash">Cash — bills in hand</option>
                </select>
                <div className="input-prefix" style={{ width: 130 }}>
                  <span>$</span>
                  <input className="input mono" inputMode="decimal" placeholder="0.00" value={acctBalance} onChange={(e) => setAcctBalance(e.target.value)} />
                </div>
              </div>
              <button className="btn btn-primary btn-block" onClick={addAccount} disabled={busy}>
                {busy ? "Adding…" : "Add my account"}
              </button>
            </div>
            <p className="faint text-xs" style={{ marginTop: 12 }}>
              Bank connections that pull this in automatically are coming — for now this stays 100% on your device.
            </p>
          </>
        )}

        {step === "goal" && (
          <>
            <div className="tour-icon">🎯</div>
            <h2 className="tour-title">Step 2 · Give your money one small job</h2>
            <p className="tour-body" style={{ minHeight: 0 }}>
              A <b>goal</b> is a target you save toward. We'll start tiny: <b>$100</b>. That's the hardest
              hundred you'll ever save — after that it gets easier, we promise. The app will track it and
              cheer you on.
            </p>
            <div className="col" style={{ gap: 10, textAlign: "left", marginTop: 6 }}>
              <input className="input" value={goalName} onChange={(e) => setGoalName(e.target.value)} />
              <button className="btn btn-primary btn-block" onClick={addGoal} disabled={busy}>
                {busy ? "Setting it up…" : "Start my $100 goal"}
              </button>
            </div>
          </>
        )}

        {step === "levelup" && (
          <>
            <div className="levelup-badge">1</div>
            <div className="levelup-float">+ LEVEL UP</div>
            <h2 className="tour-title">You just leveled up 🎉</h2>
            <p className="tour-body" style={{ minHeight: 0 }}>
              And here's your prize: the <b>Rewards</b> tab is unlocked for you — <b>free, forever</b>.
              You'll earn XP and streaks for good money habits: logging spending, staying under budget,
              feeding that $100 goal. Small wins add up. That's the whole secret.
            </p>
            <button className="btn btn-primary btn-block" onClick={finish} disabled={busy}>
              {busy ? "…" : "Show me my rewards →"}
            </button>
          </>
        )}

        {err && <p className="danger text-sm" style={{ marginTop: 10 }}>{err}</p>}

        <div className="tour-dots" style={{ marginTop: 16 }}>
          {STEP_ORDER.map((k, i) => (
            <span key={k} className={`tour-dot ${i === stepIndex ? "on" : i < stepIndex ? "done" : ""}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
