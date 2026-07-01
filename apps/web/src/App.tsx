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
import { GamificationPage } from "./features/gamification/GamificationPage";
import { GoalsPage } from "./features/goals/GoalsPage";
import { InvestmentsPage } from "./features/investments/InvestmentsPage";
import { NetWorthPage } from "./features/networth/NetWorthPage";
import { RecurringPage } from "./features/recurring/RecurringPage";
import { ReportsPage } from "./features/reports/ReportsPage";
import { SubscriptionPage } from "./features/subscription/SubscriptionPage";
import { TransactionsPage } from "./features/transactions/TransactionsPage";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-wrap">
        <Spinner label="Booting BudgetSmart…" />
      </div>
    );
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
