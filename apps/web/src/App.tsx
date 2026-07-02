import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { AppShell } from "./components/AppShell";
import { FeatureGate } from "./components/FeatureGate";
import { Spinner } from "./components/ui";
import { AccountsPage } from "./features/accounts/AccountsPage";
import { LoginPage, RegisterPage } from "./features/auth/AuthPages";
import { BudgetsPage } from "./features/budgets/BudgetsPage";
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

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/budgets" element={<BudgetsPage />} />
        <Route path="/recurring" element={<FeatureGate feature="recurring"><RecurringPage /></FeatureGate>} />
        <Route path="/insights" element={<FeatureGate feature="insights"><InsightsPage /></FeatureGate>} />
        <Route path="/import" element={<FeatureGate feature="import"><ImportPage /></FeatureGate>} />
        <Route path="/forecast" element={<FeatureGate feature="forecast"><ForecastPage /></FeatureGate>} />
        <Route path="/intelligence" element={<FeatureGate feature="intelligence"><IntelligencePage /></FeatureGate>} />
        <Route path="/goals" element={<GoalsPage />} />
        <Route path="/debt" element={<DebtPage />} />
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
