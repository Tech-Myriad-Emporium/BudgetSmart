import {
  FAMILY_ROLE_LABELS,
  FAMILY_ROLES,
  formatMoney,
  parseMoney,
  type FamilyMember,
  type FamilyRole,
  type Tier,
} from "@budgetsmart/shared";
import { useState } from "react";
import { EmptyState, Money, Spinner } from "../../components/ui";
import {
  useAccountLink,
  useFamily,
  useFamilyMutations,
  useLinkAccount,
  usePlans,
  useSubscription,
  useSyncAccount,
  useUnlinkAccount,
} from "../../lib/hooks";

const WEB_ACCOUNT_URL = "https://budgetsmarttme.com/account";

const GROUP_LABEL: Record<string, string> = {
  base: "Own it once",
  individual: "Individual",
  family: "Family — up to 5 people",
};

type BillingInterval = "month" | "year";

/** For individual tiers, the plan each one builds on (shown as "Everything in …"). */
const BUILDS_ON: Record<string, string> = {
  ind_t1: "Base App",
  ind_t2: "Tier 1",
  ind_t3: "Tier 2",
};

export function SubscriptionPage() {
  const subQ = useSubscription();
  const plansQ = usePlans();
  const [billing, setBilling] = useState<BillingInterval>("year");

  const current = subQ.data;
  const plans = plansQ.data;
  const canManageFamily = current?.entitlements.canManageFamily ?? false;

  if (subQ.isLoading || plansQ.isLoading || !current || !plans) {
    return <div className="page"><Spinner label="Loading plans…" /></div>;
  }

  const groups = ["base", "individual", "family"] as const;

  return (
    <div className="page">
      <AccountCard />

      {/* current plan */}
      <div className="card" style={{ borderColor: "var(--border-accent)", boxShadow: "var(--shadow-glow)" }}>
        <div className="row between wrap" style={{ gap: 16 }}>
          <div className="col">
            <span className="card-title">Current plan</span>
            <span className="stat stat-lg accent">{current.entitlements.tier.name}</span>
            <span className="faint text-xs">
              {current.entitlements.tier.priceCents === 0
                ? "Free"
                : `${formatMoney(current.entitlements.tier.priceCents)}/mo${
                    current.entitlements.tier.annualPriceCents
                      ? ` or ${formatMoney(current.entitlements.tier.annualPriceCents)}/yr`
                      : ""
                  }`}{" "}
              · up to {current.entitlements.memberLimit} member{current.entitlements.memberLimit === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </div>

      {/* billing interval toggle */}
      <div className="row gap-sm" style={{ justifyContent: "center" }}>
        <button className={`btn btn-sm ${billing === "month" ? "btn-primary" : ""}`} onClick={() => setBilling("month")}>
          Monthly
        </button>
        <button className={`btn btn-sm ${billing === "year" ? "btn-primary" : ""}`} onClick={() => setBilling("year")}>
          Yearly · save ~25%
        </button>
      </div>

      {/* pricing grid by group — billing happens on the web */}
      {groups.map((group) => (
        <div key={group} className="col gap-sm">
          <span className="label" style={{ marginLeft: 4 }}>{GROUP_LABEL[group]}</span>
          <div className="grid grid-3">
            {plans.tiers
              .filter((t) => t.group === group)
              .map((t) => (
                <TierCard key={t.id} tier={t} current={t.id === current.tierId} billing={billing} />
              ))}
          </div>
        </div>
      ))}

      {/* family management */}
      {canManageFamily ? (
        <FamilyPanel />
      ) : (
        <div className="card">
          <EmptyState
            icon="👪"
            title="Family management is a Family-plan feature"
            hint="Choose any Family plan on the web to add up to 5 members, set allowances, and see a family overview."
          />
        </div>
      )}
    </div>
  );
}

/** Connect this device to the central (web) account; the web subscription syncs here. */
function AccountCard() {
  const accountQ = useAccountLink();
  const link = useLinkAccount();
  const sync = useSyncAccount();
  const unlink = useUnlinkAccount();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function doLink() {
    if (email && password) link.mutate({ email, password });
  }

  const a = accountQ.data;
  if (accountQ.isLoading) {
    return <div className="card"><Spinner label="Checking account…" /></div>;
  }

  if (a?.linked) {
    return (
      <div className="card" style={{ borderColor: "var(--border-accent)" }}>
        <div className="row between wrap" style={{ gap: 16 }}>
          <div className="col">
            <span className="card-title">Connected account</span>
            <span className="text-sm">{a.email}</span>
            <span className="faint text-xs">
              Synced plan: <span className="accent">{a.entitlements?.tier.name ?? a.tier}</span>
              {a.status ? ` · ${a.status}` : ""}
            </span>
          </div>
          <div className="row gap-sm wrap">
            <a className="btn btn-primary btn-sm" href={WEB_ACCOUNT_URL} target="_blank" rel="noreferrer">Manage plan on the web ↗</a>
            <button className="btn btn-sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
              {sync.isPending ? <span className="ring" /> : "Sync now"}
            </button>
            <button className="btn btn-ghost btn-sm btn-danger" onClick={() => unlink.mutate()} disabled={unlink.isPending}>
              Disconnect
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <span className="card-title">Connect your BudgetSmart account</span>
      <p className="faint text-xs" style={{ margin: "6px 0 12px", maxWidth: 560 }}>
        Sign in with the account you made at budgetsmarttme.com. Your subscription there unlocks features here —
        buy or change your plan on the web, then reload the app to sync.
      </p>
      <div className="row gap-sm wrap" style={{ maxWidth: 560 }}>
        <input className="input" style={{ flex: 1, minWidth: 180 }} type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input" style={{ flex: 1, minWidth: 160 }} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLink()} />
        <button className="btn btn-primary" onClick={doLink} disabled={link.isPending}>
          {link.isPending ? <span className="ring" /> : "Connect"}
        </button>
      </div>
      {link.isError && (
        <div className="text-xs" style={{ color: "var(--danger)", marginTop: 8 }}>{(link.error as Error).message}</div>
      )}
      <div className="faint text-xs" style={{ marginTop: 10 }}>
        No account yet? <a className="accent" href={WEB_ACCOUNT_URL} target="_blank" rel="noreferrer">Create one on the web ↗</a>
      </div>
    </div>
  );
}

function TierCard({ tier, current, billing }: { tier: Tier; current: boolean; billing: BillingInterval }) {
  const buildsOn = BUILDS_ON[tier.id];
  const yearly = billing === "year" && tier.annualPriceCents !== undefined && tier.priceCents > 0;
  const price = yearly ? tier.annualPriceCents! : tier.priceCents;
  const cadence = tier.priceCents === 0 ? "" : tier.interval === "once" ? "one-time" : yearly ? "/yr" : "/mo";
  return (
    <div
      className="card"
      style={{
        borderColor: current ? "var(--accent)" : tier.highlight ? "var(--accent-dim)" : undefined,
        boxShadow: current ? "var(--shadow-glow)" : undefined,
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {tier.highlight && !current && <span className="badge accent text-xs" style={{ position: "absolute", top: 14, right: 14 }}>Popular</span>}
      <span className="card-title">{tier.name}</span>
      <div className="row" style={{ alignItems: "baseline", gap: 6, marginTop: 8 }}>
        <span className="stat stat-xl">{tier.priceCents === 0 ? "Free" : formatMoney(price)}</span>
        {tier.priceCents > 0 && <span className="faint text-xs">{cadence}</span>}
      </div>
      {yearly && (
        <span className="faint text-xs" style={{ marginTop: 2 }}>
          ≈ {formatMoney(Math.round(tier.annualPriceCents! / 12))}/mo · vs {formatMoney(tier.priceCents * 12)} monthly
        </span>
      )}
      <span className="faint text-xs" style={{ display: "block", marginTop: 4, minHeight: 28 }}>{tier.tagline}</span>
      <div className="badge" style={{ marginTop: 8 }}>up to {tier.memberLimit} member{tier.memberLimit === 1 ? "" : "s"}</div>

      {buildsOn && <div className="faint text-xs" style={{ marginTop: 14 }}>Everything in {buildsOn}, plus:</div>}
      <div className="col gap-sm" style={{ margin: "10px 0 16px", flex: 1 }}>
        {tier.highlights.map((h, i) => (
          <div className="row gap-sm" key={i} style={{ gap: 8, alignItems: "flex-start" }}>
            <span className="accent" style={{ lineHeight: 1.4 }}>✓</span>
            <span className="text-xs" style={{ lineHeight: 1.4 }}>{h}</span>
          </div>
        ))}
      </div>

      {current ? (
        <button className="btn btn-block" disabled>
          Current plan
        </button>
      ) : (
        <a className="btn btn-block btn-primary" href={WEB_ACCOUNT_URL} target="_blank" rel="noreferrer">
          {tier.interval === "once" ? "Get the app ↗" : "Choose on the web ↗"}
        </a>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Family panel
 * ------------------------------------------------------------------ */
function FamilyPanel() {
  const familyQ = useFamily(true);
  const { addMember, removeMember } = useFamilyMutations();
  const [name, setName] = useState("");
  const [role, setRole] = useState<FamilyRole>("child");

  const overview = familyQ.data;

  function add() {
    if (!name.trim()) return;
    addMember.mutate({ name: name.trim(), role, color: "#00FF41" }, { onSuccess: () => setName("") });
  }

  return (
    <>
      <div className="card">
        <div className="row between wrap" style={{ gap: 16 }}>
          <div className="row" style={{ gap: 28 }}>
            <Stat label="Members" value={`${overview?.memberCount ?? 0}/${overview?.memberLimit ?? 5}`} />
            <Stat label="Wallets" value={formatMoney(overview?.totalBalance ?? 0)} tone="accent" />
            <Stat label="Given" value={formatMoney(overview?.totalAllowance ?? 0)} />
            <Stat label="Spent" value={formatMoney(overview?.totalSpent ?? 0)} tone="danger" />
            <Stat label="Invested" value={formatMoney(overview?.totalInvested ?? 0)} tone="accent" />
          </div>
        </div>
        <div className="row gap-sm wrap" style={{ marginTop: 16 }}>
          <input className="input" style={{ width: 180 }} placeholder="Member name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <select className="select" style={{ width: 130 }} value={role} onChange={(e) => setRole(e.target.value as FamilyRole)}>
            {FAMILY_ROLES.map((r) => (
              <option key={r} value={r}>{FAMILY_ROLE_LABELS[r]}</option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={add} disabled={addMember.isPending || (overview ? overview.memberCount >= overview.memberLimit : false)}>
            + Add member
          </button>
        </div>
        <div className="faint text-xs" style={{ marginTop: 8 }}>
          As the owner you can only <span className="accent">add money</span> to a member's wallet. They choose to spend or invest it.
        </div>
      </div>

      {familyQ.isLoading ? (
        <Spinner label="Loading family…" />
      ) : !overview || overview.members.length === 0 ? (
        <div className="card"><EmptyState icon="👪" title="No members yet" hint="Add your first family member above." /></div>
      ) : (
        <div className="grid grid-2">
          {overview.members.map((m) => (
            <MemberCard key={m.id} member={m} onRemove={() => removeMember.mutate(m.id)} />
          ))}
        </div>
      )}
    </>
  );
}

function MemberCard({ member: m, onRemove }: { member: FamilyMember; onRemove: () => void }) {
  const { addAllowance, record } = useFamilyMutations();
  const [amount, setAmount] = useState("");

  function addMoney() {
    const cents = parseMoney(amount);
    if (!cents || cents <= 0) return;
    addAllowance.mutate({ id: m.id, amount: cents }, { onSuccess: () => setAmount("") });
  }
  function spend(kind: "spend" | "invest") {
    const cents = parseMoney(amount);
    if (!cents || cents <= 0) return;
    record.mutate({ id: m.id, kind, amount: cents }, { onSuccess: () => setAmount("") });
  }

  const busy = addAllowance.isPending || record.isPending;

  return (
    <div className="card">
      <div className="row between">
        <div className="row gap-sm">
          <span className="cat-icon" style={{ borderColor: m.color }}>{m.name.charAt(0).toUpperCase()}</span>
          <div className="col">
            <span className="text-sm" style={{ fontWeight: 600 }}>{m.name}</span>
            <span className="faint text-xs">{FAMILY_ROLE_LABELS[m.role]}</span>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm btn-danger" onClick={onRemove} title="Remove member">✕</button>
      </div>

      <div className="row between" style={{ margin: "14px 0 4px" }}>
        <span className="label">Wallet balance</span>
        <Money cents={m.balance} colorize className="stat-lg" />
      </div>
      <div className="row" style={{ gap: 16, marginBottom: 12 }}>
        <span className="faint text-xs">given <Money cents={m.allowanceTotal} className="text-xs" /></span>
        <span className="faint text-xs">spent <Money cents={m.spentTotal} className="text-xs" /></span>
        <span className="faint text-xs">invested <Money cents={m.investedTotal} className="text-xs" /></span>
      </div>

      <div className="row gap-sm">
        <div className="input-prefix grow">
          <span>$</span>
          <input className="input mono btn-sm" style={{ padding: "6px 10px 6px 22px" }} inputMode="decimal" placeholder="amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-sm" onClick={addMoney} disabled={busy} title="Owner: add money only">{busy ? <span className="ring" /> : "+ Add money"}</button>
      </div>
      <div className="row gap-sm" style={{ marginTop: 8 }}>
        <button className="btn btn-sm grow" onClick={() => spend("spend")} disabled={busy}>Record spend</button>
        <button className="btn btn-sm grow" onClick={() => spend("invest")} disabled={busy}>Record invest</button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "accent" | "danger" }) {
  return (
    <div className="col">
      <span className="label">{label}</span>
      <span className={`stat stat-lg ${tone ?? ""}`}>{value}</span>
    </div>
  );
}
