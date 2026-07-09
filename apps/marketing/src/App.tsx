import {
  TIERS,
  formatMoney,
  type Tier,
  PLAN_FEATURES,
  quotePlan,
  MIN_CUSTOM_SEATS,
  MIN_ENTERPRISE_SEATS,
} from "@budgetsmart/shared";
import { useEffect, useMemo, useState } from "react";
import { LanguagePicker, useI18n } from "./i18n";

const API = "https://budgetsmart-api.budgetsmart.workers.dev";

const DOMAIN = "budgetsmarttme.com";
// Bump to force a new bundle hash (rotates the asset URL past any bad edge cache).
const SITE_BUILD = "2026-07-08a";

const FEATURE_CARDS = [
  { icon: "◫", k: "feat1" },
  { icon: "◎", k: "feat2" },
  { icon: "▼", k: "feat3" },
  { icon: "▲", k: "feat4" },
  { icon: "◆", k: "feat5" },
  { icon: "▥", k: "feat6" },
  { icon: "⟳", k: "feat7" },
  { icon: "★", k: "feat8" },
];

const STATUS_KEYS = ["status.api", "status.sync", "status.bank", "status.web", "status.notif"];

const MARKET_URL = "https://budgetsmart-api.budgetsmart.workers.dev/market/summary";

interface TickerQuote { label: string; price: number; changePct: number | null }

/** Live market strip — quotes cached server-side, refreshed every minute. */
function MarketTicker() {
  const [quotes, setQuotes] = useState<TickerQuote[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(MARKET_URL)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d?.quotes && setQuotes(d.quotes))
        .catch(() => { /* offline — hide */ });
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (quotes.length === 0) return null;
  return (
    <div className="ticker" aria-label="Live market data">
      {quotes.map((q) => (
        <span className="ticker-item" key={q.label}>
          <span className="ticker-label">{q.label}</span>
          <span className="mono">{q.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
          {q.changePct !== null && (
            <span className={`mono ${q.changePct >= 0 ? "up" : "down"}`}>
              {q.changePct >= 0 ? "▲" : "▼"}{Math.abs(q.changePct).toFixed(2)}%
            </span>
          )}
        </span>
      ))}
      <span className="ticker-live">● LIVE</span>
    </div>
  );
}

export function App() {
  return (
    <>
      <Nav />
      <MarketTicker />
      <Hero />
      <Features />
      <Pricing />
      <CustomTeaser />
      <Downloads />
      <Status />
      <Faq />
      <Footer />
    </>
  );
}

function Brand() {
  return (
    <a href="/" className="brand" aria-label="BudgetSmart home">
      <img src="/brand.png" alt="BudgetSmart" className="brand-img" />
    </a>
  );
}

export function Nav() {
  const { t } = useI18n();
  return (
    <nav className="nav">
      <Brand />
      <div className="nav-links">
        <a href="/#features">{t("nav.features")}</a>
        <a href="/#pricing">{t("nav.pricing")}</a>
        <a href="/#download">{t("nav.download")}</a>
        <a href="/help">{t("nav.help")}</a>
        <LanguagePicker />
        <a className="btn nav-icon-btn" href="/account?tab=notifications" title={t("status.notif")} aria-label={t("status.notif")}>🔔</a>
        <a className="btn" href="/account" style={{ padding: "8px 16px" }}>{t("nav.account")}</a>
        <a className="btn btn-primary" href="#download" style={{ padding: "8px 16px" }}>
          {t("nav.get")}
        </a>
      </div>
    </nav>
  );
}

function Hero() {
  const { t } = useI18n();
  return (
    <header className="hero">
      <div className="wrap">
        <div className="eyebrow">{t("hero.eyebrow")}</div>
        <h1>
          {t("hero.title1")}
          <br />
          <span className="accent">{t("hero.title2")}</span>
        </h1>
        <p>{t("hero.sub")}</p>
        <div className="hero-cta">
          <a className="btn btn-primary" href="#download">{t("hero.ctaDownload")}</a>
          <a className="btn" href="#pricing">{t("hero.ctaPricing")}</a>
        </div>

        <div className="hero-stats">
          <div className="hero-stat">
            <div className="n mono">12</div>
            <div className="l">{t("hero.statModules")}</div>
          </div>
          <div className="hero-stat">
            <div className="n mono">5</div>
            <div className="l">{t("hero.statPlatforms")}</div>
          </div>
          <div className="hero-stat">
            <div className="n mono">$0</div>
            <div className="l">{t("hero.statStart")}</div>
          </div>
        </div>

        <div className="terminal">
          <div className="terminal-bar">
            <span className="terminal-dot" />
            <span className="terminal-dot" />
            <span className="terminal-dot" />
            <span className="faint mono" style={{ marginLeft: 8, fontSize: 12 }}>budgetsmart — dashboard</span>
          </div>
          <div className="terminal-body">
            <div className="line"><span className="prompt">›</span> safe-to-spend ......... <span className="accent">$15,174.19</span></div>
            <div className="line"><span className="prompt">›</span> net worth ............. <span className="accent">$48,377.00</span></div>
            <div className="line"><span className="prompt">›</span> goals ................. Emergency Fund <span className="accent">62%</span> · Japan Trip <span className="accent">40%</span></div>
            <div className="line"><span className="prompt">›</span> debt-free ............. <span className="accent">2029-07</span> (saving $2,455)</div>
            <div className="line"><span className="prompt">›</span> rewards ............... Level 3 · <span className="accent">Money Mapper</span> 🔥</div>
          </div>
        </div>
      </div>
    </header>
  );
}

function Features() {
  const { t } = useI18n();
  return (
    <section id="features">
      <div className="wrap">
        <div className="eyebrow">{t("feat.eyebrow")}</div>
        <h2 className="section-title">{t("feat.title")}</h2>
        <p className="section-sub">{t("feat.sub")}</p>
        <div className="grid grid-4" style={{ marginTop: 36 }}>
          {FEATURE_CARDS.map((f) => (
            <div className="card" key={f.k}>
              <div className="feature-icon">{f.icon}</div>
              <h3>{t(`${f.k}.t`)}</h3>
              <p>{t(`${f.k}.b`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const { t } = useI18n();
  const groups: Array<{ key: string; label: string }> = [
    { key: "free", label: t("price.gFree") },
    { key: "individual", label: t("price.gInd") },
    { key: "family", label: t("price.gFam") },
    { key: "custom", label: t("price.gCustom") },
  ];
  return (
    <section id="pricing">
      <div className="wrap">
        <div className="eyebrow">{t("price.eyebrow")}</div>
        <h2 className="section-title">{t("price.title")}</h2>
        <p className="section-sub">{t("price.sub")}</p>
        <div className="pricing-groups">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="eyebrow" style={{ marginBottom: 12 }}>{g.label}</div>
              <div className="pricing-grid">
                {TIERS.filter((tier) => tier.group === g.key).map((tier) => (
                  <PlanCard key={tier.id} tier={tier} />
                ))}
                {g.key === "custom" && (
                  <>
                    <div className="plan">
                      <span className="name">Custom</span>
                      <div className="price">Your build<small> · annual</small></div>
                      <div className="tagline">6+ people. Pick exactly the features you need — priced per item.</div>
                      <ul>
                        <li><span className="check">✓</span> À-la-carte feature selection</li>
                        <li><span className="check">✓</span> Minimum 6 seats</li>
                        <li><span className="check">✓</span> Annual billing only</li>
                        <li><span className="check">✓</span> Set up by contacting us</li>
                      </ul>
                      <a className="btn" href="/build">Build your plan →</a>
                    </div>
                    <div className="plan popular">
                      <span className="tag">30+ SEATS</span>
                      <span className="name">Enterprise</span>
                      <div className="price">Your build<small> · annual</small></div>
                      <div className="tagline">30+ people. Fully customizable — every feature, your rules.</div>
                      <ul>
                        <li><span className="check">✓</span> Everything customizable</li>
                        <li><span className="check">✓</span> Priority support & onboarding</li>
                        <li><span className="check">✓</span> Central admin & audit trail</li>
                        <li><span className="check">✓</span> Annual billing only</li>
                      </ul>
                      <a className="btn btn-primary" href="/build">Build your plan →</a>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlanCard({ tier }: { tier: Tier }) {
  const { t } = useI18n();
  const shown = tier.highlights.slice(0, 6);
  const rest = tier.highlights.slice(6);
  const members = t("price.members")
    .replace("{n}", String(tier.memberLimit))
    .replace("{s}", tier.memberLimit === 1 ? "" : "s");
  return (
    <div className={`plan ${tier.highlight ? "popular" : ""}`}>
      {tier.highlight && <span className="tag">{t("price.popular")}</span>}
      <span className="name">{tier.name}</span>
      <div className="price">
        {tier.priceCents === 0 ? t("price.free") : formatMoney(tier.priceCents)}
        {tier.priceCents > 0 && <small>{tier.interval === "once" ? t("price.once") : t("price.mo")}</small>}
      </div>
      <div className="tagline">{tier.tagline}</div>
      <ul>
        {shown.map((h, i) => (
          <li key={i}>
            <span className="check">✓</span> {h}
          </li>
        ))}
        <li className="faint">{members}</li>
      </ul>
      {rest.length > 0 && (
        <details className="plan-more">
          <summary>All {tier.highlights.length} features</summary>
          <ul>
            {rest.map((h, i) => (
              <li key={i}>
                <span className="check">✓</span> {h}
              </li>
            ))}
          </ul>
        </details>
      )}
      <a className={`btn ${tier.highlight ? "btn-primary" : ""}`} href="/account">
        {tier.interval === "once" ? t("price.getApp") : t("price.choose")}
      </a>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Custom & Enterprise. The landing shows a teaser; the actual builder lives
 * on its own /build page (BuildPlanPage) with step pricing + order submission.
 * ------------------------------------------------------------------ */
const CONTACT_EMAIL = "budgetsmart.techmyriademporium@gmail.com";

function CustomTeaser() {
  return (
    <section id="custom">
      <div className="wrap">
        <div className="eyebrow">// custom &amp; enterprise</div>
        <h2 className="section-title">Bring it to your whole team.</h2>
        <p className="section-sub">
          Teams of {MIN_CUSTOM_SEATS}+ pick capabilities à la carte with simple step pricing —
          the more you add, the higher the band. {MIN_ENTERPRISE_SEATS}+ seats unlocks Enterprise with
          full customization and priority support. Build a plan, get a receipt, pay, and redeem a code
          that unlocks and shares your plan by email.
        </p>
        <div className="hero-cta" style={{ marginTop: 20 }}>
          <a className="btn btn-primary" href="/build">Build your team plan →</a>
          <a className="btn" href="/account">Redeem a code</a>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * /build — the standalone Custom/Enterprise plan builder.
 * Step pricing: the per-person band is set by how many features you pick.
 * Submitting posts an order to the API, which emails a priced receipt; once
 * paid, a redeemable code is issued to unlock and share the plan.
 * ------------------------------------------------------------------ */
export function BuildPlanPage() {
  const [people, setPeople] = useState(MIN_CUSTOM_SEATS);
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(["core", "import", "recurring", "insights", "reports", "team"]),
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ref: string; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const itemKeys = useMemo(
    () => PLAN_FEATURES.filter((f) => f.required || picked.has(f.key)).map((f) => f.key),
    [picked],
  );
  const quote = quotePlan(people, itemKeys.length);
  const enterprise = quote.planType === "enterprise";

  function toggle(key: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function submit() {
    setErr(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setErr("Enter a valid email so we can send your receipt.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seats: people, items: itemKeys, name, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        // Stripe is live → send them straight to secure checkout. The pay link is
        // also in their email, so procurement can forward it to whoever pays.
        if (data.payUrl) { window.location.href = data.payUrl; return; }
        setResult({ ref: data.ref, total: data.quote?.total ?? quote.total });
      } else setErr(data.error ?? "Couldn't submit your order — try again in a moment.");
    } catch {
      setErr("Network error — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Nav />
      <section id="build" style={{ paddingTop: 40 }}>
        <div className="wrap">
          <div className="eyebrow">// custom &amp; enterprise</div>
          <h1 className="section-title">Build your team plan.</h1>
          <p className="section-sub">
            Pick the capabilities your team needs — the more you add, the higher the price band.
            Custom starts at {MIN_CUSTOM_SEATS} people; {MIN_ENTERPRISE_SEATS}+ unlocks Enterprise.
            Annual only. Submit and we email a receipt within 24 hours — pay it and you get a
            redeemable code to unlock and share your plan.
          </p>

          {result ? (
            <div className="card" style={{ marginTop: 24, maxWidth: 640 }}>
              <div className="feature-icon">🧾</div>
              <h3>Order {result.ref} received</h3>
              <p>
                We've emailed your order to <strong>{email}</strong> for{" "}
                <span className="accent">${result.total.toLocaleString()}/yr</span>. Reply to that email to arrange payment —
                the moment it clears, your <strong>redemption code</strong> is emailed automatically. Redeem it at{" "}
                <a className="accent" href="/account">your account</a> to unlock the plan, then invite your team by email.
              </p>
              <p className="faint" style={{ fontSize: 13, marginTop: 8 }}>
                Didn't get the email? Check spam/junk — it comes from {CONTACT_EMAIL}.
              </p>
              <a className="btn btn-primary" href="/account" style={{ marginTop: 12 }}>Go to your account</a>
            </div>
          ) : (
            <div className="builder">
              <div className="builder-items">
                {PLAN_FEATURES.map((item) => {
                  const on = item.required || picked.has(item.key);
                  return (
                    <label key={item.key} className={`builder-item ${on ? "on" : ""} ${item.required ? "req" : ""}`}>
                      <input type="checkbox" checked={on} disabled={item.required} onChange={() => toggle(item.key)} />
                      <span className="builder-label">{item.label}{item.required ? " (included)" : ""}</span>
                    </label>
                  );
                })}
              </div>

              <div className="builder-quote">
                <div className="builder-mode mono">{enterprise ? "◆ ENTERPRISE" : "◇ CUSTOM"}</div>
                <label className="builder-people">
                  People
                  <input
                    type="number"
                    min={MIN_CUSTOM_SEATS}
                    value={people}
                    onChange={(e) => setPeople(Math.max(MIN_CUSTOM_SEATS, Math.floor(Number(e.target.value) || MIN_CUSTOM_SEATS)))}
                  />
                </label>
                <div className="builder-line"><span>Features chosen</span><span className="mono">{quote.itemCount}</span></div>
                <div className="builder-line"><span>{quote.bandLabel}</span><span className="mono">${quote.perPersonYear}/person/yr</span></div>
                <div className="builder-line"><span>Seats</span><span className="mono">× {people}</span></div>
                <div className="builder-line"><span>Setup &amp; support ($100 / 30 seats)</span><span className="mono">+ ${quote.blockFee}</span></div>
                <div className="builder-total">
                  <span>Annual total</span>
                  <span className="mono accent">${quote.total.toLocaleString()}</span>
                </div>
                {!enterprise && people < MIN_ENTERPRISE_SEATS && (
                  <div className="builder-note">Enterprise (full customization, priority support) starts at {MIN_ENTERPRISE_SEATS} seats.</div>
                )}
                <input className="acct-input" style={{ marginTop: 12 }} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
                <input className="acct-input" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
                <button className="btn btn-primary" style={{ width: "100%", marginTop: 10 }} onClick={submit} disabled={busy}>
                  {busy ? "Starting checkout…" : "Continue to secure checkout →"}
                </button>
                {err && <div className="builder-note" style={{ color: "#ff5c5c" }}>{err}</div>}
                <div className="builder-note" style={{ marginTop: 8 }}>
                  Secure checkout by Stripe. The moment payment clears, your redeemable code is emailed instantly. Annual only.
                </div>
              </div>
            </div>
          )}

          <p className="section-sub" style={{ marginTop: 28, fontSize: 14 }}>
            ← <a className="accent" href="/">Back to BudgetSmart</a>
          </p>
        </div>
      </section>
      <Footer />
    </>
  );
}

const WINDOWS_INSTALLER = "https://budgetsmart-api.budgetsmart.workers.dev/download/BudgetSmart-Setup.exe";

const LINUX_APPIMAGE = "https://budgetsmart-api.budgetsmart.workers.dev/download/BudgetSmart.AppImage";
const ANDROID_APK = "https://budgetsmart-api.budgetsmart.workers.dev/download/BudgetSmart.apk";
const MAC_ARM_DMG = "https://budgetsmart-api.budgetsmart.workers.dev/download/BudgetSmart-arm64.dmg";
const MAC_X64_DMG = "https://budgetsmart-api.budgetsmart.workers.dev/download/BudgetSmart-x64.dmg";
const IOS_IPA = "https://budgetsmart-api.budgetsmart.workers.dev/download/BudgetSmart.ipa";

const APT_INSTALL = `curl -fsSL https://budgetsmart-api.budgetsmart.workers.dev/apt/budgetsmart.gpg \\
  | sudo tee /usr/share/keyrings/budgetsmart.gpg > /dev/null
echo "deb [signed-by=/usr/share/keyrings/budgetsmart.gpg] \\
  https://budgetsmart-api.budgetsmart.workers.dev/apt stable main" \\
  | sudo tee /etc/apt/sources.list.d/budgetsmart.list
sudo apt update && sudo apt install budgetsmart`;

function Downloads() {
  const { t } = useI18n();
  const platforms = [
    { os: "Windows", icon: "⊞", meta: "Windows 10 & 11", file: WINDOWS_INSTALLER },
    { os: "macOS", icon: "", meta: "Apple silicon · M1+", file: MAC_ARM_DMG },
    { os: "macOS", icon: "", meta: "Intel Macs", file: MAC_X64_DMG },
    { os: "Linux", icon: "🐧", meta: "AppImage · any distro", file: LINUX_APPIMAGE },
    { os: "Android", icon: "🤖", meta: "Android 7+ · APK", file: ANDROID_APK },
    { os: "iOS", icon: "", meta: "Sideload · AltStore / Sideloadly", file: IOS_IPA },
  ];
  return (
    <section id="download">
      <div className="wrap">
        <div className="eyebrow">{t("dl.eyebrow")}</div>
        <h2 className="section-title">{t("dl.title")}</h2>
        <p className="section-sub">{t("dl.sub")}</p>
        <p className="section-sub" style={{ fontSize: 13, marginTop: 2 }}><span className="accent mono">Latest: Beta v1.2.3</span></p>
        <div className="dl-grid">
          {platforms.map((p) => (
            <div className="dl" key={p.os + p.meta}>
              <div className="platform">{p.icon}</div>
              <div className="os">{p.os}</div>
              <div className="meta">{p.meta}</div>
              {p.file ? (
                <a className="btn btn-primary" href={p.file} download>{t("dl.btn")}</a>
              ) : (
                <span className="btn" aria-disabled="true" style={{ opacity: 0.5, pointerEvents: "none" }}>{t("dl.soon")}</span>
              )}
            </div>
          ))}
        </div>
        <p className="section-sub" style={{ fontSize: 13, marginTop: 4 }}>
          {t("dl.apkNote")}
        </p>
        <p className="section-sub" style={{ fontSize: 13, marginTop: 4 }}>
          {t("dl.iosNote")} <a className="accent" href="https://altstore.io" target="_blank" rel="noreferrer">altstore.io</a> ·{" "}
          <a className="accent" href="https://sideloadly.io" target="_blank" rel="noreferrer">sideloadly.io</a>
        </p>
        <div className="apt-box">
          <div className="apt-title">{t("dl.aptTitle")}</div>
          <pre className="apt-code"><code>{APT_INSTALL}</code></pre>
          <div className="apt-note">{t("dl.aptNote")} <code>apt upgrade</code>.</div>
        </div>
      </div>
    </section>
  );
}

function Status() {
  const { t } = useI18n();
  return (
    <section id="status">
      <div className="wrap">
        <div className="eyebrow">{t("status.eyebrow")}</div>
        <h2 className="section-title">{t("status.title")}</h2>
        <div className="status-box">
          {STATUS_KEYS.map((k) => (
            <div className="status-row" key={k}>
              <span>{t(k)}</span>
              <span className="status-ok">
                <span className="status-pill" /> {t("status.operational")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const { t } = useI18n();
  return (
    <section id="faq">
      <div className="wrap">
        <div className="eyebrow">{t("faq.eyebrow")}</div>
        <h2 className="section-title">{t("faq.title")}</h2>
        <div className="faq">
          {[1, 2, 3, 4].map((i) => (
            <details key={i}>
              <summary>{t(`faq.q${i}`)}</summary>
              <p>{t(`faq.a${i}`)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

const LEARN_LINKS = [
  { href: "/help", label: "Help & guides" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/budgeting-software/", label: "Budgeting software" },
  { href: "/mint-alternative/", label: "Mint alternative" },
  { href: "/ynab-alternative/", label: "YNAB alternative" },
  { href: "/free-budget-app/", label: "Free budget app" },
  { href: "/family-budget-app/", label: "Family budget app" },
  { href: "/offline-budget-app/", label: "Offline budget app" },
  { href: "/tme/", label: "About TME" },
];

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="footer">
      <div className="wrap">
        <Brand />
        <div className="faint" data-build={SITE_BUILD}>© {new Date().getFullYear()} BudgetSmart · Tech Myriad Emporium (TME) · {DOMAIN}</div>
        <div className="muted" style={{ display: "flex", gap: 18 }}>
          <a href="/#features">{t("nav.features")}</a>
          <a href="/#pricing">{t("nav.pricing")}</a>
          <a href="/#download">{t("nav.download")}</a>
          <a href="/help">{t("nav.help")}</a>
          <a href="/#status">{t("nav.status")}</a>
        </div>
      </div>
      <div className="wrap footer-learn">
        {LEARN_LINKS.map((l) => (
          <a key={l.href} href={l.href}>{l.label}</a>
        ))}
      </div>
    </footer>
  );
}
