// Account + billing hub for budgetsmarttme.com. Talks to the central Worker API
// (register, email verification, login, Stripe checkout/portal). This is where a
// user buys/manages a subscription on the web; the desktop app then syncs it.
import { useEffect, useRef, useState } from "react";

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
  birthday: string | null;
  avatarUrl: string | null;
  locale: string;
  theme: string;
  location: string | null;
  twoFactorEnabled: boolean;
}

/** Apply the chosen theme to the document (persisted per account + locally). */
function applyTheme(theme: string) {
  document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
  try { localStorage.setItem("bs_theme", theme); } catch { /* ignore */ }
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
const INVITE_KEY = "bs_invite"; // family-invite token parked until the user is signed in

export function AccountPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function refresh() {
    if (!getToken()) { setAccount(null); setLoading(false); return; }
    // If they arrived through a family-invite email, accept it now that they're signed in.
    const pending = localStorage.getItem(INVITE_KEY);
    if (pending) {
      localStorage.removeItem(INVITE_KEY);
      const a = await api("/family/accept", { method: "POST", body: JSON.stringify({ token: pending }) });
      setNotice(a.ok
        ? { kind: "ok", text: "🎉 Family invite accepted — you now share the family plan." }
        : { kind: "err", text: a.data.error ?? "Couldn't accept the family invite." });
    }
    const r = await api<{ account: Account }>("/me");
    if (r.ok) { setAccount(r.data.account); applyTheme(r.data.account.theme); }
    else { localStorage.removeItem(TOKEN_KEY); setAccount(null); }
    setLoading(false);
  }
  useEffect(() => {
    applyTheme(localStorage.getItem("bs_theme") ?? "dark");
    // Park a family-invite token (?invite=…) so it survives login/registration.
    const inv = new URLSearchParams(window.location.search).get("invite");
    if (inv) localStorage.setItem(INVITE_KEY, inv);
    // Pick up the token returned by the Google OAuth callback (#token=…).
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const tok = hash.get("token");
    if (tok) localStorage.setItem(TOKEN_KEY, tok);
    if (inv || tok) history.replaceState(null, "", window.location.pathname);
    refresh();
  }, []);

  return (
    <div className="acct-wrap">
      <a className="acct-brand" href="/">Budget<span>Smart</span></a>
      {notice && <p className={`acct-msg ${notice.kind}`} style={{ marginBottom: 14 }}>{notice.text}</p>}
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
  const [challenge, setChallenge] = useState<string | null>(null); // set when 2FA is required
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(() => {
    if (new URLSearchParams(window.location.search).get("oauth") === "error") {
      return { kind: "err", text: "Google sign-in didn't complete. Please try again." };
    }
    if (localStorage.getItem(INVITE_KEY)) {
      return { kind: "info", text: "👨‍👩‍👧‍👦 You have a family invite waiting — sign in (or create a free account) with the invited email to accept it." };
    }
    return null;
  });

  async function submit() {
    setBusy(true); setMsg(null);
    try {
      if (mode === "register") {
        const r = await api("/auth/register", { method: "POST", body: JSON.stringify({ email, password, name }) });
        if (r.ok) setMsg({ kind: "info", text: "Check your inbox for a verification link, then sign in. Don't see it? Check your spam/junk folder — it may land there." });
        else setMsg({ kind: "err", text: r.data.error ?? "Couldn't register." });
      } else {
        const r = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
        if (r.ok && r.data.twoFactor) { setChallenge(r.data.challenge); }
        else if (r.ok) { localStorage.setItem(TOKEN_KEY, r.data.token); onAuthed(); }
        else if (r.status === 403) setMsg({ kind: "info", text: "Please verify your email first — we've re-sent the link. Check your spam/junk folder if it isn't in your inbox." });
        else setMsg({ kind: "err", text: r.data.error ?? "Couldn't sign in." });
      }
    } finally { setBusy(false); }
  }

  async function verify2fa() {
    setBusy(true); setMsg(null);
    try {
      const r = await api("/auth/2fa/verify", { method: "POST", body: JSON.stringify({ challenge, code }) });
      if (r.ok) { localStorage.setItem(TOKEN_KEY, r.data.token); onAuthed(); }
      else { setMsg({ kind: "err", text: r.data.error ?? "Incorrect code." }); if (r.status === 401 && String(r.data.error ?? "").includes("sign in")) setChallenge(null); }
    } finally { setBusy(false); }
  }

  if (challenge) {
    return (
      <div className="acct-card">
        <div className="acct-muted" style={{ marginBottom: 12 }}>🔒 Two-factor authentication</div>
        <p className="acct-muted" style={{ fontSize: 13, marginBottom: 12 }}>Enter the 6-digit code from your authenticator app.</p>
        <input className="acct-input" inputMode="numeric" autoFocus maxLength={6} placeholder="123456" value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && verify2fa()} />
        <button className="btn btn-primary acct-block" onClick={verify2fa} disabled={busy || code.length < 6}>{busy ? "…" : "Verify"}</button>
        <button className="btn acct-block acct-ghost" onClick={() => { setChallenge(null); setCode(""); setMsg(null); }} style={{ marginTop: 8 }}>Back</button>
        {msg && <p className={`acct-msg ${msg.kind}`}>{msg.text}</p>}
      </div>
    );
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
      <div className="acct-or"><span>or</span></div>
      <a className="btn acct-block acct-google" href={`${API}/auth/google/start`}>
        <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.3C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.5 5C9.6 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.2 5.3C41.4 35.9 44 30.4 44 24c0-1.3-.1-2.3-.4-3.5z"/></svg>
        Continue with Google
      </a>
      {msg && <p className={`acct-msg ${msg.kind}`}>{msg.text}</p>}
      {mode === "register" && (
        <p className="acct-muted" style={{ marginTop: 10, fontSize: 12 }}>
          Verification emails come from budgetsmart.techmyriademporium@gmail.com — if it doesn't arrive in a minute, check your spam/junk folder.
        </p>
      )}
    </div>
  );
}

interface Notif { id: string; type: string; title: string; body: string | null; read: number; created_at: string; }

function Notifications() {
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);

  async function load() {
    const r = await api<{ notifications: Notif[]; unread: number }>("/notifications");
    if (r.ok) { setItems(r.data.notifications); setUnread(r.data.unread); }
  }
  useEffect(() => {
    load();
    if (new URLSearchParams(window.location.search).get("tab") === "notifications") {
      setTimeout(() => document.getElementById("notifications")?.scrollIntoView({ behavior: "smooth" }), 200);
    }
  }, []);
  async function markAll() { await api("/notifications/read-all", { method: "POST" }); load(); }

  return (
    <div className="acct-card" id="notifications">
      <div className="acct-row">
        <div className="acct-muted">🔔 Notifications {unread > 0 && <span className="acct-badge">{unread}</span>}</div>
        {unread > 0 && <button className="btn acct-ghost" onClick={markAll}>Mark all read</button>}
      </div>
      {items.length === 0 ? (
        <p className="acct-muted" style={{ marginTop: 10 }}>No notifications yet.</p>
      ) : (
        <div className="acct-notif-list">
          {items.map((n) => (
            <div className={`acct-notif ${n.read ? "" : "unread"}`} key={n.id}>
              <div className="acct-notif-title">{n.title}</div>
              {n.body && <div className="acct-notif-body">{n.body}</div>}
              <div className="acct-notif-time">{new Date(n.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileEditor({ account, onChange }: { account: Account; onChange: () => void }) {
  const [name, setName] = useState(account.name);
  const [birthday, setBirthday] = useState(account.birthday ?? "");
  const [location, setLocation] = useState(account.location ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function save() {
    setBusy(true); setMsg(null);
    const r = await api("/account/profile", { method: "POST", body: JSON.stringify({ name, birthday, location }) });
    setBusy(false);
    if (r.ok) { setMsg({ kind: "ok", text: "Saved." }); onChange(); } else setMsg({ kind: "err", text: r.data.error ?? "Couldn't save." });
  }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 2_000_000) { setMsg({ kind: "err", text: "Image must be under 2 MB." }); return; }
    const data = await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(file); });
    setBusy(true);
    const r = await api("/account/avatar", { method: "POST", body: JSON.stringify({ data }) });
    setBusy(false);
    if (r.ok) { setMsg({ kind: "ok", text: "Photo updated." }); onChange(); } else setMsg({ kind: "err", text: r.data.error ?? "Upload failed." });
  }

  const initial = (account.name || account.email).charAt(0).toUpperCase();
  return (
    <div className="acct-card">
      <div className="acct-muted" style={{ marginBottom: 14 }}>Your profile</div>
      <div className="acct-profile-row">
        <button className="acct-avatar" onClick={() => fileRef.current?.click()} title="Change photo" type="button">
          {account.avatarUrl ? <img src={account.avatarUrl} alt="avatar" /> : <span>{initial}</span>}
          <span className="acct-avatar-edit">✎</span>
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onFile} />
        <div className="acct-profile-fields">
          <label className="acct-field">Name<input className="acct-input" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <div className="acct-two">
            <label className="acct-field">Birthday<input className="acct-input" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} /></label>
            <label className="acct-field">Location<input className="acct-input" placeholder="City, Country" value={location} onChange={(e) => setLocation(e.target.value)} /></label>
          </div>
        </div>
      </div>
      <button className="btn btn-primary acct-block" onClick={save} disabled={busy} style={{ marginTop: 12 }}>{busy ? "…" : "Save profile"}</button>
      {msg && <p className={`acct-msg ${msg.kind}`}>{msg.text}</p>}
    </div>
  );
}

function SecuritySettings({ account, onChange }: { account: Account; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function begin() {
    setBusy(true); setMsg(null);
    const r = await api<{ secret: string; otpauth: string }>("/account/2fa/setup", { method: "POST" });
    setBusy(false);
    if (r.ok) setSetup(r.data); else setMsg({ kind: "err", text: r.data.error ?? "Couldn't start setup." });
  }
  async function confirm() {
    setBusy(true); setMsg(null);
    const r = await api("/account/2fa/enable", { method: "POST", body: JSON.stringify({ code }) });
    setBusy(false);
    if (r.ok) { setSetup(null); setCode(""); setMsg({ kind: "ok", text: "Two-factor is on." }); onChange(); }
    else setMsg({ kind: "err", text: r.data.error ?? "Couldn't enable." });
  }
  async function disable() {
    setBusy(true); setMsg(null);
    const r = await api("/account/2fa/disable", { method: "POST", body: JSON.stringify({ code }) });
    setBusy(false);
    if (r.ok) { setDisabling(false); setCode(""); setMsg({ kind: "ok", text: "Two-factor turned off." }); onChange(); }
    else setMsg({ kind: "err", text: r.data.error ?? "Couldn't disable." });
  }
  const codeInput = (
    <input className="acct-input" inputMode="numeric" maxLength={6} autoFocus placeholder="123456" value={code}
      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
  );

  return (
    <div className="acct-card">
      <div className="acct-row">
        <div className="acct-muted">🔒 Two-factor authentication {account.twoFactorEnabled && <span className="acct-badge on">On</span>}</div>
        {!account.twoFactorEnabled && !setup && <button className="btn" onClick={begin} disabled={busy}>{busy ? "…" : "Enable 2FA"}</button>}
        {account.twoFactorEnabled && !disabling && <button className="btn acct-ghost" onClick={() => setDisabling(true)}>Turn off</button>}
      </div>

      {setup && (
        <div style={{ marginTop: 12 }}>
          <p className="acct-muted" style={{ fontSize: 13 }}>1. In an authenticator app (Google Authenticator, Authy, 1Password…) add an account and enter this setup key:</p>
          <code className="acct-secret">{setup.secret}</code>
          <p className="acct-muted" style={{ fontSize: 13, marginTop: 12 }}>2. Enter the 6-digit code it shows:</p>
          {codeInput}
          <button className="btn btn-primary acct-block" onClick={confirm} disabled={busy || code.length < 6}>{busy ? "…" : "Confirm & enable"}</button>
        </div>
      )}

      {disabling && (
        <div style={{ marginTop: 12 }}>
          <p className="acct-muted" style={{ fontSize: 13 }}>Enter a current code to turn 2FA off:</p>
          {codeInput}
          <div className="acct-two" style={{ marginTop: 8 }}>
            <button className="btn btn-primary acct-block" onClick={disable} disabled={busy || code.length < 6}>{busy ? "…" : "Turn off 2FA"}</button>
            <button className="btn acct-block acct-ghost" onClick={() => { setDisabling(false); setCode(""); setMsg(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {!account.twoFactorEnabled && !setup && <p className="acct-muted" style={{ fontSize: 12, marginTop: 10 }}>Add a second step at sign-in using any authenticator app.</p>}
      {msg && <p className={`acct-msg ${msg.kind}`}>{msg.text}</p>}
    </div>
  );
}

interface FamilyMember { id: string; name: string; email: string; role: string; joinedAt: string; avatarUrl: string | null }
interface FamilyInvite { id: string; to_email: string; created_at: string }
interface Family { id: string; ownerId: string; members: FamilyMember[]; invites: FamilyInvite[]; seatsLeft: number }

function FamilyCard({ account, onChange }: { account: Account; onChange: () => void }) {
  const [fam, setFam] = useState<Family | null>(null);
  const [canOwn, setCanOwn] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function load() {
    const r = await api<{ family: Family | null; canOwn: boolean }>("/family");
    if (r.ok) { setFam(r.data.family); setCanOwn(r.data.canOwn); }
  }
  useEffect(() => { load(); }, [account.tier]);

  async function invite() {
    setBusy(true); setMsg(null);
    const r = await api<{ family: Family }>("/family/invite", { method: "POST", body: JSON.stringify({ email }) });
    setBusy(false);
    if (r.ok) {
      setEmail(""); setFam(r.data.family);
      setMsg({ kind: "ok", text: "Invite sent! It comes from our bot Gmail — tell them to check spam/junk if it doesn't show up." });
    } else setMsg({ kind: "err", text: r.data.error ?? "Couldn't send the invite." });
  }
  async function revoke(id: string) {
    const r = await api<{ family: Family }>("/family/invite/revoke", { method: "POST", body: JSON.stringify({ id }) });
    if (r.ok) setFam(r.data.family);
  }
  async function remove(userId: string) {
    const r = await api<{ family: Family }>("/family/remove", { method: "POST", body: JSON.stringify({ userId }) });
    if (r.ok) setFam(r.data.family);
  }
  async function leave() {
    setBusy(true);
    const r = await api("/family/leave", { method: "POST" });
    setBusy(false);
    if (r.ok) { setFam(null); onChange(); } else setMsg({ kind: "err", text: r.data.error ?? "Couldn't leave the family." });
  }

  if (canOwn === null) return null; // still loading
  if (!fam && !canOwn) return null; // no family plan and not in one — nothing to show
  const isOwner = fam ? fam.ownerId === account.id : true;

  return (
    <div className="acct-card">
      <div className="acct-row">
        <div className="acct-muted">👨‍👩‍👧‍👦 Family {fam && <span className="acct-badge on">{fam.members.length}/5</span>}</div>
        {fam && !isOwner && <button className="btn acct-ghost" onClick={leave} disabled={busy}>Leave family</button>}
      </div>

      {fam && (
        <div className="acct-members">
          {fam.members.map((m) => (
            <div className="acct-member" key={m.id}>
              <span className="acct-member-avatar">
                {m.avatarUrl ? <img src={m.avatarUrl} alt="" /> : (m.name || m.email).charAt(0).toUpperCase()}
              </span>
              <span className="acct-member-name">{m.name || m.email}{m.id === account.id ? " (you)" : ""}</span>
              <span className="acct-member-role">{m.role === "owner" ? "Owner" : "Member"}</span>
              {isOwner && m.role !== "owner" && <button className="btn acct-ghost" onClick={() => remove(m.id)}>Remove</button>}
            </div>
          ))}
          {isOwner && fam.invites.map((i) => (
            <div className="acct-member pending" key={i.id}>
              <span className="acct-member-avatar">✉️</span>
              <span className="acct-member-name">{i.to_email}</span>
              <span className="acct-member-role">Invited</span>
              <button className="btn acct-ghost" onClick={() => revoke(i.id)}>Revoke</button>
            </div>
          ))}
        </div>
      )}

      {isOwner && (!fam || fam.seatsLeft > 0) && (
        <div className="acct-invite-row">
          <input className="acct-input" type="email" placeholder="family.member@email.com" value={email}
            onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && invite()} />
          <button className="btn btn-primary" onClick={invite} disabled={busy || !email}>{busy ? "…" : "Invite"}</button>
        </div>
      )}
      {isOwner ? (
        <p className="acct-muted" style={{ fontSize: 12, marginTop: 8 }}>
          Your plan covers 5 people including you. Invites come from budgetsmart.techmyriademporium@gmail.com and expire in 14 days.
        </p>
      ) : fam && (
        <p className="acct-muted" style={{ fontSize: 12, marginTop: 8 }}>You share this family's plan. The owner manages members.</p>
      )}
      {msg && <p className={`acct-msg ${msg.kind}`}>{msg.text}</p>}
    </div>
  );
}

function AccountView({ account, onChange }: { account: Account; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [billing, setBilling] = useState<Billing>("year");

  async function toggleTheme() {
    const next = (localStorage.getItem("bs_theme") ?? account.theme) === "light" ? "dark" : "light";
    applyTheme(next);
    await api("/account/profile", { method: "POST", body: JSON.stringify({ theme: next }) });
  }

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
            <button className="btn acct-ghost" onClick={toggleTheme} title="Toggle light/dark">🌓 Theme</button>
            <button className="btn" onClick={manage} disabled={busy === "portal"}>Manage billing</button>
            <button className="btn acct-ghost" onClick={logout}>Sign out</button>
          </div>
        </div>
        {err && <p className="acct-msg err">{err}</p>}
        <p className="acct-muted" style={{ marginTop: 12 }}>
          After you subscribe, open the desktop app and reload — your plan syncs automatically.
        </p>
      </div>

      <ProfileEditor account={account} onChange={onChange} />
      <SecuritySettings account={account} onChange={onChange} />
      <FamilyCard account={account} onChange={onChange} />
      <Notifications />


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
