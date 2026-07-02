import { FEATURES, TIERS, formatMoney, hasFeature, type Tier } from "@budgetsmart/shared";
import { LanguagePicker, useI18n } from "./i18n";

const DOMAIN = "budgetsmarttme.com";

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

export function App() {
  return (
    <>
      <Nav />
      <Hero />
      <Features />
      <Pricing />
      <Downloads />
      <Status />
      <Faq />
      <Footer />
    </>
  );
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">$</span>
      <span>
        Budget<span className="accent">Smart</span>
      </span>
    </div>
  );
}

function Nav() {
  const { t } = useI18n();
  return (
    <nav className="nav">
      <Brand />
      <div className="nav-links">
        <a href="#features">{t("nav.features")}</a>
        <a href="#pricing">{t("nav.pricing")}</a>
        <a href="#download">{t("nav.download")}</a>
        <a href="#status">{t("nav.status")}</a>
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
            <div className="n mono">4</div>
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
  const granted = FEATURES.filter((f) => hasFeature(tier, f.key)).slice(0, 5);
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
        {granted.map((f) => (
          <li key={f.key}>
            <span className="check">✓</span> {f.label}
          </li>
        ))}
        <li className="faint">{members}</li>
      </ul>
      <a className={`btn ${tier.highlight ? "btn-primary" : ""}`} href="/account">
        {tier.interval === "once" ? t("price.getApp") : t("price.choose")}
      </a>
    </div>
  );
}

const WINDOWS_INSTALLER = "https://budgetsmart-api.budgetsmart.workers.dev/download/BudgetSmart-Setup.exe";

const LINUX_APPIMAGE = "https://budgetsmart-api.budgetsmart.workers.dev/download/BudgetSmart.AppImage";
const ANDROID_APK = "https://budgetsmart-api.budgetsmart.workers.dev/download/BudgetSmart.apk";

const APT_INSTALL = `curl -fsSL https://budgetsmart-api.budgetsmart.workers.dev/apt/budgetsmart.gpg \\
  | sudo tee /usr/share/keyrings/budgetsmart.gpg > /dev/null
echo "deb [signed-by=/usr/share/keyrings/budgetsmart.gpg] \\
  https://budgetsmart-api.budgetsmart.workers.dev/apt stable main" \\
  | sudo tee /etc/apt/sources.list.d/budgetsmart.list
sudo apt update && sudo apt install budgetsmart`;

function Downloads() {
  const { t } = useI18n();
  const platforms = [
    { os: "iOS", icon: "", meta: "iPhone & iPad", file: null },
    { os: "Android", icon: "🤖", meta: "Android 7+ · APK", file: ANDROID_APK },
    { os: "macOS", icon: "", meta: "Apple silicon & Intel", file: null },
    { os: "Windows", icon: "⊞", meta: "Windows 10 & 11 · ~110 MB", file: WINDOWS_INSTALLER },
    { os: "Linux", icon: "🐧", meta: "AppImage · any distro", file: LINUX_APPIMAGE },
  ];
  return (
    <section id="download">
      <div className="wrap">
        <div className="eyebrow">{t("dl.eyebrow")}</div>
        <h2 className="section-title">{t("dl.title")}</h2>
        <p className="section-sub">{t("dl.sub")}</p>
        <div className="dl-grid">
          {platforms.map((p) => (
            <div className="dl" key={p.os}>
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
  { href: "/budgeting-software/", label: "Budgeting software" },
  { href: "/mint-alternative/", label: "Mint alternative" },
  { href: "/ynab-alternative/", label: "YNAB alternative" },
  { href: "/free-budget-app/", label: "Free budget app" },
  { href: "/family-budget-app/", label: "Family budget app" },
  { href: "/offline-budget-app/", label: "Offline budget app" },
  { href: "/tme/", label: "About TME" },
];

function Footer() {
  const { t } = useI18n();
  return (
    <footer className="footer">
      <div className="wrap">
        <Brand />
        <div className="faint">© {new Date().getFullYear()} BudgetSmart · Tech Myriad Emporium (TME) · {DOMAIN}</div>
        <div className="muted" style={{ display: "flex", gap: 18 }}>
          <a href="#features">{t("nav.features")}</a>
          <a href="#pricing">{t("nav.pricing")}</a>
          <a href="#download">{t("nav.download")}</a>
          <a href="#status">{t("nav.status")}</a>
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
