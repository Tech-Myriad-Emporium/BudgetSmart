import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { AppShell } from "./components/AppShell";
import { FeatureGate } from "./components/FeatureGate";
import { Spinner } from "./components/ui";
import { AccountsPage } from "./features/accounts/AccountsPage";
import { LoginPage, RegisterPage } from "./features/auth/AuthPages";
import { BudgetsPage } from "./features/budgets/BudgetsPage";
import { CalendarPage } from "./features/calendar/CalendarPage";
import { CreditPage } from "./features/credit/CreditPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { DebtPage } from "./features/debt/DebtPage";
import { ForecastPage } from "./features/forecast/ForecastPage";
import { GamificationPage } from "./features/gamification/GamificationPage";
import { GoalsPage } from "./features/goals/GoalsPage";
import { ImportPage } from "./features/import/ImportPage";
import { InsightsPage } from "./features/insights/InsightsPage";
import { IntelligencePage } from "./features/intelligence/IntelligencePage";
import { InvestmentsPage } from "./features/investments/InvestmentsPage";
import { NetWorthPage } from "./features/networth/NetWorthPage";
import { RecurringPage } from "./features/recurring/RecurringPage";
import { ReportsPage } from "./features/reports/ReportsPage";
import { SubscriptionPage } from "./features/subscription/SubscriptionPage";
import { TransactionsPage } from "./features/transactions/TransactionsPage";
import { api } from "./lib/api";
import { TIPS } from "./lib/tips";
import { useEffect, useState } from "react";

/** Boot screen: spinner + rotating money tips you can scroll through. */
function BootScreen() {
  const [i, setI] = useState(() => Math.floor(Math.random() * TIPS.length));
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % TIPS.length), 4500);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="auth-wrap">
      <div className="col" style={{ alignItems: "center", gap: 22 }}>
        <img
          src="/BudgetSmart.gif"
          alt="BudgetSmart"
          style={{ maxWidth: 480, width: "100%", borderRadius: 12, border: "1px solid var(--border)", boxShadow: "var(--shadow-glow, 0 0 24px rgba(0,255,65,.18))" }}
        />
        <Spinner label="Booting BudgetSmart…" />
        <div className="card" style={{ maxWidth: 480, width: "100%", textAlign: "left" }}>
          <span className="accent text-xs" style={{ letterSpacing: "0.12em" }}>💡 TIP {i + 1}/{TIPS.length}</span>
          <p className="text-sm" style={{ marginTop: 8, lineHeight: 1.55, minHeight: 42, color: "var(--fg-muted)" }}>{TIPS[i]}</p>
          <div className="row gap-sm" style={{ marginTop: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setI((v) => (v - 1 + TIPS.length) % TIPS.length)}>‹ prev</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setI((v) => (v + 1) % TIPS.length)}>next ›</button>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ *
 * Onboarding: a required first-run tour. Until it's completed, the app
 * renders ONLY this overlay — nothing else is clickable.
 * ------------------------------------------------------------------ */
const TOUR_STEPS: Array<{ icon: string; title: string; body: string }> = [
  { icon: "👋", title: "Welcome to BudgetSmart", body: "Your money, on your device. Everything you track stays local — this quick tour shows you how the app works. It takes about a minute." },
  { icon: "▦", title: "The Dashboard", body: "Your home base: Safe-to-Spend tells you what you can spend right now without breaking anything, next to net worth, cashflow and your budgets at a glance." },
  { icon: "⇄", title: "Transactions & Import", body: "Log spending by hand in seconds, or drop in a bank statement (CSV/OFX/QIF) on the Import tab — BudgetSmart auto-categorizes it from your own history and skips duplicates." },
  { icon: "◫", title: "Budgets", body: "Set monthly limits per category (sub-categories too). Rollover carries what's left. The Insights tab will even suggest budgets from your real spending." },
  { icon: "▧", title: "Calendar & Recurring", body: "Detected bills, paychecks and goal milestones land on the Calendar automatically. Mark anything \u201cnot recurring\u201d or track a merchant manually on the Recurring tab." },
  { icon: "◎", title: "Goals & Debt", body: "Set savings goals with projected finish dates, plan debt payoff (snowball or avalanche), and watch the interest you save. Family plans can even share goals." },
  { icon: "◇", title: "Plans & sync", body: "Connect the account you created on budgetsmarttme.com under Plans — your subscription unlocks features here, and your tabs are fully reorderable via ⚙ Customize. That's it, you're ready!" },
];

function OnboardingTour({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const s = TOUR_STEPS[step]!;
  const last = step === TOUR_STEPS.length - 1;

  async function finish() {
    setBusy(true);
    try { await api.completeOnboarding(); } catch { /* offline — let them in anyway */ }
    onDone();
  }

  return (
    <div className="tour-overlay">
      <div className="tour-card">
        <img src="/brand.png" alt="BudgetSmart" style={{ height: 36, width: "auto", marginBottom: 18 }} />
        <div className="tour-icon">{s.icon}</div>
        <h2 className="tour-title">{s.title}</h2>
        <p className="tour-body">{s.body}</p>
        <div className="tour-dots">
          {TOUR_STEPS.map((_, i) => (
            <span key={i} className={`tour-dot ${i === step ? "on" : i < step ? "done" : ""}`} />
          ))}
        </div>
        <div className="row gap-sm" style={{ justifyContent: "center", marginTop: 18 }}>
          {step > 0 && <button className="btn" onClick={() => setStep(step - 1)} disabled={busy}>‹ Back</button>}
          {!last ? (
            <button className="btn btn-primary" onClick={() => setStep(step + 1)}>Next ›</button>
          ) : (
            <button className="btn btn-primary" onClick={finish} disabled={busy}>
              {busy ? "…" : "Start using BudgetSmart →"}
            </button>
          )}
        </div>
        <div className="faint text-xs" style={{ marginTop: 14 }}>Step {step + 1} of {TOUR_STEPS.length}</div>
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <BootScreen />;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Required first-run tour — the ONLY thing rendered until completed.
  if (!user.onboarded) {
    return <OnboardingTour onDone={() => window.location.reload()} />;
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/budgets" element={<BudgetsPage />} />
        <Route path="/recurring" element={<FeatureGate feature="recurring"><RecurringPage /></FeatureGate>} />
        <Route path="/calendar" element={<FeatureGate feature="recurring"><CalendarPage /></FeatureGate>} />
        <Route path="/insights" element={<FeatureGate feature="insights"><InsightsPage /></FeatureGate>} />
        <Route path="/import" element={<FeatureGate feature="import"><ImportPage /></FeatureGate>} />
        <Route path="/forecast" element={<FeatureGate feature="forecast"><ForecastPage /></FeatureGate>} />
        <Route path="/intelligence" element={<FeatureGate feature="intelligence"><IntelligencePage /></FeatureGate>} />
        <Route path="/goals" element={<GoalsPage />} />
        <Route path="/debt" element={<DebtPage />} />
        <Route path="/credit" element={<CreditPage />} />
        <Route path="/investments" element={<FeatureGate feature="investments"><InvestmentsPage /></FeatureGate>} />
        <Route path="/networth" element={<FeatureGate feature="networth"><NetWorthPage /></FeatureGate>} />
        <Route path="/reports" element={<FeatureGate feature="reports"><ReportsPage /></FeatureGate>} />
        <Route path="/rewards" element={<FeatureGate feature="gamification"><GamificationPage /></FeatureGate>} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/plans" element={<SubscriptionPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
