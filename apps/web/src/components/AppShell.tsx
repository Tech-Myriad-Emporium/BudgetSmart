import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../lib/api";
import { useEntitlements } from "../lib/hooks";

const NAV: { to: string; label: string; icon: string; end?: boolean; feature?: string }[] = [
  { to: "/", label: "Dashboard", icon: "▦", end: true },
  { to: "/transactions", label: "Transactions", icon: "⇄" },
  { to: "/import", label: "Import", icon: "⤒", feature: "import" },
  { to: "/budgets", label: "Budgets", icon: "◫" },
  { to: "/recurring", label: "Recurring", icon: "⟳", feature: "recurring" },
  { to: "/calendar", label: "Calendar", icon: "▧", feature: "recurring" },
  { to: "/insights", label: "Insights", icon: "✦", feature: "insights" },
  { to: "/goals", label: "Goals", icon: "◎" },
  { to: "/debt", label: "Debt", icon: "▼" },
  { to: "/investments", label: "Investments", icon: "▲", feature: "investments" },
  { to: "/networth", label: "Net Worth", icon: "◆", feature: "networth" },
  { to: "/forecast", label: "Forecast", icon: "◠", feature: "forecast" },
  { to: "/reports", label: "Reports", icon: "▥", feature: "reports" },
  { to: "/intelligence", label: "Intelligence", icon: "⚡", feature: "intelligence" },
  { to: "/rewards", label: "Rewards", icon: "★", feature: "gamification" },
  { to: "/accounts", label: "Accounts", icon: "▤" },
  { to: "/plans", label: "Plans", icon: "◇" },
];

const TITLES: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Dashboard", subtitle: "Your money at a glance" },
  "/transactions": { title: "Transactions", subtitle: "Every dollar, tracked" },
  "/import": { title: "Import", subtitle: "Bring in bank statements — auto-tagged, deduped" },
  "/budgets": { title: "Budgets", subtitle: "Plan and pace your spending" },
  "/recurring": { title: "Recurring", subtitle: "Subscriptions and repeating bills" },
  "/calendar": { title: "Calendar", subtitle: "Bills, paychecks, and milestones by date" },
  "/insights": { title: "Insights", subtitle: "Cleanup, auto-tagging, and overspend alerts" },
  "/forecast": { title: "Forecast", subtitle: "Where your cashflow is headed" },
  "/intelligence": { title: "Intelligence", subtitle: "Tax, debt, investment, and life planning" },
  "/goals": { title: "Goals", subtitle: "Save toward what matters" },
  "/debt": { title: "Debt", subtitle: "Plan your payoff, kill the interest" },
  "/investments": { title: "Investments", subtitle: "Portfolio, allocation, and growth" },
  "/networth": { title: "Net Worth", subtitle: "Everything you own, minus what you owe" },
  "/reports": { title: "Reports", subtitle: "Trends, cashflow, and exports" },
  "/rewards": { title: "Rewards", subtitle: "Level up your money game" },
  "/accounts": { title: "Accounts", subtitle: "Balances across every account" },
  "/plans": { title: "Plans & Family", subtitle: "Pick a tier, manage your family" },
};

export function AppShell() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const { has } = useEntitlements();
  const qc = useQueryClient();
  const meta = TITLES[pathname] ?? { title: "BudgetSmart", subtitle: "" };

  // On app load, re-sync the subscription tier from the central account so a
  // plan bought on the web shows up here after a reload.
  useEffect(() => {
    api
      .syncAccount()
      .then(() => {
        qc.invalidateQueries({ queryKey: ["subscription"] });
        qc.invalidateQueries({ queryKey: ["account"] });
      })
      .catch(() => {
        /* not linked / offline — ignore */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">$</span>
          <span>
            Budget<span className="brand-accent">Smart</span>
          </span>
        </div>

        <nav className="col gap-sm">
          {NAV.map((item) => {
            const locked = item.feature ? !has(item.feature) : false;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""} ${locked ? "nav-locked" : ""}`}
                title={locked ? `${item.label} — upgrade to unlock` : item.label}
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
                {locked && <span className="nav-lock" style={{ marginLeft: "auto", opacity: 0.6 }}>🔒</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="row between">
            <div className="col" style={{ minWidth: 0 }}>
              <span className="text-sm truncate" style={{ maxWidth: 150 }}>
                {user?.name}
              </span>
              <span className="faint text-xs truncate" style={{ maxWidth: 150 }}>
                {user?.email}
              </span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={logout} title="Sign out">
              ⏻
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{meta.title}</h1>
            <div className="subtitle">{meta.subtitle}</div>
          </div>
          <span className="chip">{user?.currency ?? "USD"}</span>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
