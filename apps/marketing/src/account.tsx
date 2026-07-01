// Account + billing hub for budgetsmarttme.com. Talks to the central Worker API
// (register, email verification, login, Stripe checkout/portal). This is where a
// user buys/manages a subscription on the web; the desktop app then syncs it.
import { useEffect, useState } from "react";

const API = "https://budgetsmart-api.budgetsmart.workers.dev";
const TOKEN_KEY = "bs_token";

type Billing = "month" | "year";
const TIERS = [
  { id: "base", name: "Base App", group: "Own it once", month: "Free", year: "Free", tagline: "Manual, private, offline." },
  { id: "ind_t1", name: "Tier 1", group: "Individual", month: "$5", year: "$44.99", tagline: "Saves $300–$800/yr in accidental waste." },
  { id: "ind_t2", name: "Tier 2", group: "Individual", month: "$9", year: "$79.99", tagline: "Saves $1,000–$3,000/yr through optimization." },
  { id: "ind_t3", name: "Tier 3", group: "Individual", month: "$13", year: "$114.99", tagline: "Replaces a tax advisor + planner — save $2k–$10k/yr." },
  { id: "fam_t1", name: "Family T1", group: "Family (5)", month: "$12.99", year: "$119.99", tagline: "Shared budgets, goals & kid accounts." },
  { id: "fam_t2", name: "Family T2", group: "Family (5)", month: "$22.99", year: "$199.99", tagline: "Approvals, His/Hers/Ours & allowances." },
  { id: "fam_t3", name: "Family T3", group: "Family (5)", month: "$32.99", year: "$299.99", tagline: "Gamified, partner forecasting & advisor portal." },
];

interface Account {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  tier: string;
  subscriptionStatus: string | null;
}

const getToken = () => localStorage.getItem(TOKEN_KEY);
async function api<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: any }> {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/* ------------------------------------------------------------------ */
export function AccountPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    if (!getToken()) { setAccount(null); setLoading(false); return; }
    const r = await api<{ account: Account }>("/me");
    if (r.ok) setAccount(r.data.account);
    else { localStorage.removeItem(TOKEN_KEY); setAccount(null); }
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);

  return (
    <div className="acct-wrap">
      <a className="acct-brand" href="/">Budget<span>Smart</span></a>
      {loading ? <p className="acct-muted">Loading…</p> : account ? <AccountView account={account} onChange={refresh} /> : <AuthPanel onAuthed={refresh} />}
    </div>
  );
}

function AuthPanel({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);

  async function submit() {
    setBusy(true); setMsg(null);
    try {
      if (mode === "register") {
        const r = await api("/auth/register", { method: "POST", body: JSON.stringify({ email, password, name }) });
        if (r.ok) setMsg({ kind: "info", text: "Check your inbox for a verification link, then sign in. Don't see it? Check your spam/junk folder — it may land there." });
        else setMsg({ kind: "err", text: r.data.error ?? "Couldn't register." });
      } else {
        const r = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
        if (r.ok) { localStorage.setItem(TOKEN_KEY, r.data.token); onAuthed(); }
        else if (r.status === 403) setMsg({ kind: "info", text: "Please verify your email first — we've re-sent the link. Check your spam/junk folder if it isn't in your inbox." });
        else setMsg({ kind: "err", text: r.data.error ?? "Couldn't sign in." });
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="acct-card">
      <div className="acct-tabs">
        <button className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>Sign in</button>
        <button className={mode === "register" ? "on" : ""} onClick={() => setMode("register")}>Create account</button>
      </div>
      {mode === "register" && <input className="acct-input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />}
      <input className="acct-input" type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="acct-input" type="password" placeholder="Password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      <button className="btn btn-primary acct-block" onClick={submit} disabled={busy}>{busy ? "…" : mode === "login" ? "Sign in" : "Create account"}</button>
      {msg && <p className={`acct-msg ${msg.kind}`}>{msg.text}</p>}
      {mode === "register" && (
        <p className="acct-muted" style={{ marginTop: 10, fontSize: 12 }}>
          Verification emails come from budgetsmart.techmyriademporium@gmail.com — if it doesn't arrive in a minute, check your spam/junk folder.
        </p>
      )}
    </div>
  );
}

function AccountView({ account, onChange }: { account: Account; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [billing, setBilling] = useState<Billing>("year");

  async function buy(tierId: string) {
    setBusy(tierId); setErr(null);
    const r = await api<{ url: string }>("/billing/checkout", { method: "POST", body: JSON.stringify({ tierId, interval: billing }) });
    if (r.ok && r.data.url) window.location.href = r.data.url;
    else { setErr(r.data.error ?? "Checkout unavailable."); setBusy(null); }
  }
  async function manage() {
    setBusy("portal"); setErr(null);
    const r = await api<{ url: string }>("/billing/portal", { method: "POST" });
    if (r.ok && r.data.url) window.location.href = r.data.url;
    else { setErr(r.data.error ?? "No billing account yet."); setBusy(null); }
  }
  function logout() { localStorage.removeItem(TOKEN_KEY); onChange(); }

  const currentName = TIERS.find((t) => t.id === account.tier)?.name ?? account.tier;

  return (
    <>
      <div className="acct-card">
        <div className="acct-row">
          <div>
            <div className="acct-muted">Signed in as</div>
            <div className="acct-email">{account.email}</div>
            <div className="acct-muted" style={{ marginTop: 6 }}>
              Plan: <span className="acct-accent">{currentName}</span>
              {account.subscriptionStatus ? ` · ${account.subscriptionStatus}` : ""}
              {account.emailVerified ? "" : " · email unverified"}
            </div>
          </div>
          <div className="acct-actions">
            <button className="btn" onClick={manage} disabled={busy === "portal"}>Manage billing</button>
            <button className="btn acct-ghost" onClick={logout}>Sign out</button>
          </div>
        </div>
        {err && <p className="acct-msg err">{err}</p>}
        <p className="acct-muted" style={{ marginTop: 12 }}>
          After you subscribe, open the desktop app and reload — your plan syncs automatically.
        </p>
      </div>

      <div className="acct-billing-toggle">
        <button className={billing === "month" ? "on" : ""} onClick={() => setBilling("month")}>Monthly</button>
        <button className={billing === "year" ? "on" : ""} onClick={() => setBilling("year")}>
          Yearly <span className="acct-save">save ~25%</span>
        </button>
      </div>

      {["Own it once", "Individual", "Family (5)"].map((group) => (
        <div key={group}>
          <div className="acct-group">{group}</div>
          <div className="acct-grid">
            {TIERS.filter((t) => t.group === group).map((t) => {
              const price = billing === "year" ? t.year : t.month;
              const cadence = t.id === "base" ? "" : billing === "year" ? "/yr" : "/mo";
              return (
                <div className="acct-plan" key={t.id}>
                  <div className="acct-plan-name">{t.name}</div>
                  <div className="acct-plan-price">{price}<span>{cadence}</span></div>
                  <div className="acct-plan-tag">{t.tagline}</div>
                  {account.tier === t.id ? (
                    <button className="btn acct-block" disabled>Current plan</button>
                  ) : t.id === "base" ? (
                    <button className="btn acct-block" disabled>Free — included</button>
                  ) : (
                    <button className="btn btn-primary acct-block" onClick={() => buy(t.id)} disabled={busy === t.id}>
                      {busy === t.id ? "…" : "Subscribe"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
export function VerifiedPage() {
  const ok = new URLSearchParams(window.location.search).get("ok") === "1";
  return (
    <div className="acct-wrap">
      <a className="acct-brand" href="/">Budget<span>Smart</span></a>
      <div className="acct-card" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 42 }}>{ok ? "✅" : "⚠️"}</div>
        <h1 style={{ fontSize: 20, margin: "8px 0" }}>{ok ? "Email verified" : "Link expired or invalid"}</h1>
        <p className="acct-muted">{ok ? "Your account is ready. Sign in to pick a plan." : "Verification links last 24 hours. Sign in to get a fresh one."}</p>
        <a className="btn btn-primary acct-block" href="/account" style={{ marginTop: 14 }}>Go to your account</a>
      </div>
    </div>
  );
}
