import { formatMoney } from "@budgetsmart/shared";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, Money, Spinner } from "../../components/ui";
import { api } from "../../lib/api";

interface MemberSnapshot {
  netWorth: number;
  assets: number;
  liabilities: number;
  liquid: number;
  income30: number;
  expenses30: number;
  debtTotal: number;
  investTotal: number;
  budgetCount: number;
  budgetOverCount: number;
  goalCount: number;
  goalAvgPct: number;
  topCategories: Array<{ name: string; icon: string; amount: number }>;
}

interface OverviewMember {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string | null;
  snapshot: MemberSnapshot | null;
  snapshotAt: string | null;
}

interface Overview {
  family: { id: string; seatLimit: number; seatsLeft: number };
  members: OverviewMember[];
  totals: {
    netWorth: number;
    liquid: number;
    income30: number;
    expenses30: number;
    debtTotal: number;
    investTotal: number;
    reporting: number;
  };
  error?: string;
}

const useMasterOverview = () =>
  useQuery<Overview>({
    queryKey: ["master"],
    queryFn: () => api.masterOverview() as Promise<Overview>,
    refetchInterval: 5 * 60_000,
    retry: false,
  });

function ago(iso: string | null): string {
  if (!iso) return "no data yet";
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function MemberCard({ m }: { m: OverviewMember }) {
  const s = m.snapshot;
  const initial = (m.name || m.email).charAt(0).toUpperCase();
  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 12 }}>
        <div className="row gap-sm" style={{ minWidth: 0 }}>
          <span className="cat-icon" style={{ borderRadius: "50%", overflow: "hidden" }}>
            {m.avatarUrl ? <img src={m.avatarUrl} alt="" width={32} height={32} style={{ objectFit: "cover" }} /> : initial}
          </span>
          <div className="col" style={{ minWidth: 0 }}>
            <span className="text-sm truncate" style={{ fontWeight: 600 }}>{m.name || m.email}</span>
            <span className="faint text-xs truncate">{m.role === "owner" ? "Owner" : "Member"} · updated {ago(m.snapshotAt)}</span>
          </div>
        </div>
        {s && s.budgetOverCount > 0 && <span className="badge danger">{s.budgetOverCount} over budget</span>}
      </div>

      {!s ? (
        <p className="faint text-sm">
          Waiting for their app to sync. Snapshots upload automatically when their BudgetSmart is open and signed in.
        </p>
      ) : (
        <>
          <div className="row between" style={{ marginBottom: 10 }}>
            <div className="col">
              <span className="label">Net worth</span>
              <Money cents={s.netWorth} className="stat stat-lg" />
            </div>
            <div className="col" style={{ textAlign: "right" }}>
              <span className="label">Liquid</span>
              <Money cents={s.liquid} className="stat" />
            </div>
          </div>
          <div className="row between text-sm" style={{ marginBottom: 6 }}>
            <span className="muted">30-day cashflow</span>
            <span>
              <span className="accent num">+{formatMoney(s.income30)}</span>
              <span className="faint"> / </span>
              <span className="num">−{formatMoney(s.expenses30)}</span>
            </span>
          </div>
          <div className="row between text-sm" style={{ marginBottom: 6 }}>
            <span className="muted">Budgets</span>
            <span className="num">{s.budgetCount === 0 ? "—" : `${s.budgetCount} set${s.budgetOverCount ? ` · ${s.budgetOverCount} over` : " · on track"}`}</span>
          </div>
          <div className="row between text-sm" style={{ marginBottom: 6 }}>
            <span className="muted">Goals</span>
            <span className="num">{s.goalCount === 0 ? "—" : `${s.goalCount} · ${s.goalAvgPct}% avg`}</span>
          </div>
          <div className="row between text-sm" style={{ marginBottom: s.topCategories.length ? 10 : 0 }}>
            <span className="muted">Debt / Invested</span>
            <span className="num">{formatMoney(s.debtTotal)} / {formatMoney(s.investTotal)}</span>
          </div>
          {s.topCategories.length > 0 && (
            <div className="row gap-sm wrap">
              {s.topCategories.map((c, i) => (
                <span className="chip" key={i}>{c.icon} {c.name} · {formatMoney(c.amount)}</span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Master: the plan owner's single view of everything everyone has. */
export function MasterPage() {
  const q = useMasterOverview();

  if (q.isLoading) return <div className="page"><Spinner label="Gathering your team's snapshots…" /></div>;

  if (q.isError || !q.data || q.data.error) {
    const msg = (q.error as Error | undefined)?.message ?? q.data?.error ?? "Couldn't load the overview.";
    return (
      <div className="page">
        <div className="card">
          <EmptyState
            icon="◈"
            title="Master view unavailable"
            hint={`${msg} The Master tab is for plan owners — invite people from your account page and their snapshots appear here.`}
          />
        </div>
      </div>
    );
  }

  const { members, totals, family } = q.data;

  return (
    <div className="page">
      <div className="grid grid-3">
        <div className="card">
          <span className="label">Household net worth</span>
          <Money cents={totals.netWorth} className="stat stat-xl" />
          <span className="faint text-xs">{totals.reporting} of {members.length} member{members.length === 1 ? "" : "s"} reporting</span>
        </div>
        <div className="card">
          <span className="label">30-day cashflow</span>
          <div className="row gap-sm" style={{ alignItems: "baseline" }}>
            <span className="stat stat-lg accent">+{formatMoney(totals.income30)}</span>
            <span className="stat stat-lg">−{formatMoney(totals.expenses30)}</span>
          </div>
          <span className="faint text-xs">everyone combined</span>
        </div>
        <div className="card">
          <span className="label">Liquid / Debt</span>
          <div className="row gap-sm" style={{ alignItems: "baseline" }}>
            <Money cents={totals.liquid} className="stat stat-lg" />
            <span className="stat stat-lg danger">{formatMoney(totals.debtTotal)}</span>
          </div>
          <span className="faint text-xs">{family.seatsLeft} seat{family.seatsLeft === 1 ? "" : "s"} still free on your plan</span>
        </div>
      </div>

      <div className="grid grid-2">
        {members.map((m) => <MemberCard key={m.id} m={m} />)}
      </div>

      <p className="faint text-xs">
        Privacy: members' apps share only these headline numbers — never their transactions, merchants or notes.
        Snapshots refresh automatically a few times a day while their app is open.
      </p>
    </div>
  );
}
