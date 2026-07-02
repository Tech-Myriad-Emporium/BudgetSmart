import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../lib/api";
import { useEntitlements } from "../lib/hooks";
import { APP_VERSION, APP_VERSION_LABEL, compareVersions } from "@budgetsmart/shared";

const VERSION_URL = "https://budgetsmart-api.budgetsmart.workers.dev/version";

/** Version footer + "update available" link when the central channel is ahead. */
function VersionFooter() {
  const [latest, setLatest] = useState<{ version: string; label: string; windows: string } | null>(null);
  useEffect(() => {
    fetch(VERSION_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => v && compareVersions(v.version, APP_VERSION) > 0 && setLatest(v))
      .catch(() => { /* offline — fine */ });
  }, []);
  return (
    <div className="col" style={{ gap: 2, marginTop: 8 }}>
      <span className="faint text-xs">{APP_VERSION_LABEL}</span>
      {latest && (
        <a className="accent text-xs" href={latest.windows} target="_blank" rel="noreferrer" title="A newer version is available">
          ⬆ {latest.label} available — download
        </a>
      )}
    </div>
  );
}

interface NavItem { to: string; label: string; icon: string; end?: boolean; feature?: string }

/** Default order (customizable by the user — stored locally). */
const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: "▦", end: true },
  { to: "/calendar", label: "Calendar", icon: "▧", feature: "recurring" },
  { to: "/accounts", label: "Accounts", icon: "▤" },
  { to: "/insights", label: "Insights", icon: "✦", feature: "insights" },
  { to: "/networth", label: "Net Worth", icon: "◆", feature: "networth" },
  { to: "/debt", label: "Debt", icon: "▼" },
  { to: "/investments", label: "Investments", icon: "▲", feature: "investments" },
  { to: "/forecast", label: "Forecast", icon: "◠", feature: "forecast" },
  { to: "/goals", label: "Goals", icon: "◎" },
  { to: "/credit", label: "Credit", icon: "▭" },
  { to: "/transactions", label: "Transactions", icon: "⇄" },
  { to: "/import", label: "Import", icon: "⤒", feature: "import" },
  { to: "/budgets", label: "Budgets", icon: "◫" },
  { to: "/recurring", label: "Recurring", icon: "⟳", feature: "recurring" },
  { to: "/reports", label: "Reports", icon: "▥", feature: "reports" },
  { to: "/intelligence", label: "Intelligence", icon: "⚡", feature: "intelligence" },
  { to: "/rewards", label: "Rewards", icon: "★", feature: "gamification" },
  { to: "/plans", label: "Plans", icon: "◇" },
];

const NAV_ORDER_KEY = "bs_nav_order";

/** Apply the user's saved order; unknown paths keep their default position. */
function orderedNav(saved: string[] | null): NavItem[] {
  if (!saved) return NAV;
  const byPath = new Map(NAV.map((n) => [n.to, n]));
  const out: NavItem[] = [];
  for (const p of saved) {
    const n = byPath.get(p);
    if (n) { out.push(n); byPath.delete(p); }
  }
  for (const n of NAV) if (byPath.has(n.to)) out.push(n); // new tabs appended in default spot
  return out;
}

const TITLES: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Dashboard", subtitle: "Your money at a glance" },
  "/transactions": { title: "Transactions", subtitle: "Every dollar, tracked" },
  "/import": { title: "Import", subtitle: "Bring in bank statements — auto-tagged, deduped" },
  "/budgets": { title: "Budgets", subtitle: "Plan and pace your spending" },
  "/recurring": { title: "Recurring", subtitle: "Subscriptions and repeating bills" },
  "/calendar": { title: "Calendar", subtitle: "Bills, paychecks, and milestones by date" },
  "/credit": { title: "Credit", subtitle: "Card payoff, utilization, and score gains" },
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

  // customizable tab order (per device)
  const [navOrder, setNavOrder] = useState<string[] | null>(() => {
    try { return JSON.parse(localStorage.getItem(NAV_ORDER_KEY) ?? "null"); } catch { return null; }
  });
  const [editingNav, setEditingNav] = useState(false);
  const nav = orderedNav(navOrder);
  function moveTab(index: number, dir: -1 | 1) {
    const paths = nav.map((n) => n.to);
    const j = index + dir;
    if (j < 0 || j >= paths.length) return;
    [paths[index], paths[j]] = [paths[j]!, paths[index]!];
    setNavOrder(paths);
    try { localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(paths)); } catch { /* ignore */ }
  }
  function resetTabs() {
    setNavOrder(null);
    try { localStorage.removeItem(NAV_ORDER_KEY); } catch { /* ignore */ }
  }

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
          {nav.map((item, i) => {
            const locked = item.feature ? !has(item.feature) : false;
            return (
              <div key={item.to} className="row" style={{ alignItems: "center", gap: 4 }}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-item ${isActive ? "active" : ""} ${locked ? "nav-locked" : ""}`}
                  style={{ flex: 1, minWidth: 0 }}
                  title={locked ? `${item.label} — upgrade to unlock` : item.label}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                  {locked && !editingNav && <span className="nav-lock" style={{ marginLeft: "auto", opacity: 0.6 }}>🔒</span>}
                </NavLink>
                {editingNav && (
                  <span className="col" style={{ gap: 2 }}>
                    <button className="nav-move" onClick={() => moveTab(i, -1)} disabled={i === 0} title="Move up">▲</button>
                    <button className="nav-move" onClick={() => moveTab(i, 1)} disabled={i === nav.length - 1} title="Move down">▼</button>
                  </span>
                )}
              </div>
            );
          })}
          <div className="row gap-sm" style={{ marginTop: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditingNav((v) => !v)} title="Reorder your tabs">
              {editingNav ? "✓ Done" : "⚙ Customize"}
            </button>
            {editingNav && navOrder && (
              <button className="btn btn-ghost btn-sm" onClick={resetTabs}>Reset</button>
            )}
          </div>
        </nav>

        <div className="sidebar-footer">
          <VersionFooter />
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
