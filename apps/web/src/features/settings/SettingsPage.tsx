// One place that feels like *yours*: profile, appearance, tabs, emails,
// plan link, your data, and the app version — no hunting through pages.
import { APP_VERSION_LABEL } from "@budgetsmart/shared";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../lib/api";
import { getThemePref, setThemePref, type ThemePref } from "../../lib/theme";
import { useAccountLink, useEntitlements, useSummaryMutations, useSummaryPrefs } from "../../lib/hooks";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <span className="card-title">{title}</span>
      {hint && <p className="faint text-xs" style={{ margin: "6px 0 0" }}>{hint}</p>}
      <div className="col" style={{ marginTop: 14, gap: 12 }}>{children}</div>
    </div>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="row between wrap" style={{ gap: 10 }}>
      <div className="col" style={{ minWidth: 0 }}>
        <span className="text-sm">{label}</span>
        {hint && <span className="faint text-xs">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function SettingsPage() {
  const { user, logout } = useAuth();
  const { tier } = useEntitlements();
  const linkQ = useAccountLink();
  const prefsQ = useSummaryPrefs(true);
  const { setPrefs } = useSummaryMutations();
  const [themePref, setThemePrefState] = useState<ThemePref>(() => getThemePref());
  const [exporting, setExporting] = useState(false);

  const pickTheme = (p: ThemePref) => { setThemePref(p); setThemePrefState(p); };

  async function exportData() {
    setExporting(true);
    try {
      const blob = await api.exportCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "budgetsmart-transactions.csv";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const linked = linkQ.data?.linked === true;

  return (
    <div className="page">
      <Section title="Profile" hint="Who this device belongs to.">
        <SettingRow label={user?.name || "—"} hint={user?.email}>
          <span className="chip">{user?.currency ?? "USD"}</span>
        </SettingRow>
        <SettingRow label="Your plan" hint={linked ? `Linked to ${linkQ.data && "email" in linkQ.data ? linkQ.data.email : "your web account"}` : "Not linked to a web account yet"}>
          <div className="row gap-sm">
            <span className="badge accent">{tier?.name ?? "Base App"}</span>
            <Link className="btn btn-sm" to="/plans">{linked ? "Manage" : "Connect"}</Link>
          </div>
        </SettingRow>
      </Section>

      <Section title="Appearance" hint="Auto follows your computer's setting.">
        <SettingRow label="Theme">
          <div className="seg" role="radiogroup" aria-label="Theme">
            {([
              { v: "system", label: "Auto" },
              { v: "light", label: "☀ Light" },
              { v: "dark", label: "☾ Dark" },
            ] as Array<{ v: ThemePref; label: string }>).map((o) => (
              <button key={o.v} className={`seg-btn ${themePref === o.v ? "on" : ""}`} onClick={() => pickTheme(o.v)} role="radio" aria-checked={themePref === o.v}>
                {o.label}
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow label="Tab order" hint="Put your most-used tabs on top.">
          <div className="row gap-sm">
            <span className="faint text-xs">Use ⚙ Customize in the sidebar</span>
            <button
              className="btn btn-sm"
              onClick={() => { localStorage.removeItem("bs_nav_order"); window.location.reload(); }}
            >
              Reset to default
            </button>
          </div>
        </SettingRow>
      </Section>

      <Section title="Email summaries" hint="Recaps of your money, sent to your linked account's inbox. Off by default.">
        <SettingRow label="Monthly recap" hint="How last month went — income, spending, budgets.">
          <input
            type="checkbox"
            checked={prefsQ.data?.enabled ?? false}
            disabled={!linked || setPrefs.isPending}
            onChange={(e) => setPrefs.mutate({ enabled: e.target.checked })}
            style={{ accentColor: "var(--accent)", width: 18, height: 18 }}
          />
        </SettingRow>
        <SettingRow label="Weekly recap" hint="A quick pulse every week.">
          <input
            type="checkbox"
            checked={prefsQ.data?.weeklyEnabled ?? false}
            disabled={!linked || setPrefs.isPending}
            onChange={(e) => setPrefs.mutate({ weeklyEnabled: e.target.checked })}
            style={{ accentColor: "var(--accent)", width: 18, height: 18 }}
          />
        </SettingRow>
        {!linked && <span className="faint text-xs">Connect your web account on the Plans page to turn these on.</span>}
      </Section>

      <Section title="Your data" hint="It's yours. Take it anywhere.">
        <SettingRow label="Export transactions" hint="Everything as a CSV file — opens in Excel or Sheets.">
          <button className="btn btn-sm" onClick={exportData} disabled={exporting}>{exporting ? "Exporting…" : "⤓ Export CSV"}</button>
        </SettingRow>
        <SettingRow label="Where your data lives" hint="On this device. Nothing is uploaded except what you turn on (like email recaps).">
          <span className="badge">Local</span>
        </SettingRow>
      </Section>

      <Section title="About">
        <SettingRow label="Version" hint="Updates are checked automatically.">
          <span className="chip">{APP_VERSION_LABEL}</span>
        </SettingRow>
        <SettingRow label="Sign out" hint="Your data stays on this device.">
          <button className="btn btn-ghost btn-sm btn-danger" onClick={logout}>⏻ Sign out</button>
        </SettingRow>
      </Section>
    </div>
  );
}
