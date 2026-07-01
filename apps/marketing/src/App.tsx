import { FEATURES, TIERS, formatMoney, hasFeature, type Tier } from "@budgetsmart/shared";

const DOMAIN = "budgetsmarttme.com";

const FEATURE_CARDS = [
  { icon: "◫", title: "Budgets & safe-to-spend", body: "Monthly limits, rollover, and a real-time number you can safely spend right now." },
  { icon: "◎", title: "Goals", body: "Targets with required-monthly pacing, projected dates, and milestone celebrations." },
  { icon: "▼", title: "Debt payoff", body: "Snowball or avalanche planners that show your debt-free date and interest saved." },
  { icon: "▲", title: "Investments", body: "Portfolio, allocation, cost basis, and a compounding growth projector." },
  { icon: "◆", title: "Net worth", body: "Accounts, investments, and debts unified into one true number — with history." },
  { icon: "▥", title: "Reports & export", body: "Cashflow, trends, category & merchant breakdowns. One-click CSV export." },
  { icon: "⟳", title: "Subscription detection", body: "We find recurring charges automatically and predict the next bill." },
  { icon: "★", title: "Rewards", body: "XP, levels, streaks, and achievements that make good money habits stick." },
];

const STATUS = [
  { name: "API", note: "operational" },
  { name: "Sync engine", note: "operational" },
  { name: "Bank connections", note: "operational" },
  { name: "Web & downloads", note: "operational" },
  { name: "Notifications", note: "operational" },
];

const FAQS = [
  { q: "How much does BudgetSmart cost?", a: "The Base app is free forever. Individual plans run $4.99–$12.99/mo, and Family plans (up to 5 people) are $9.99–$14.99/mo, unlocking automation, reports, investing, and full tax tools." },
  { q: "Which platforms are supported?", a: "The Windows desktop app is available now. macOS, iOS, and Android are on the way — your account and subscription sync across devices." },
  { q: "How do family plans work?", a: "Add up to 5 members. As the owner you add money to a member's wallet (allowance only); they decide whether to spend or invest it, and you get a family overview." },
  { q: "Is my financial data secure?", a: "BudgetSmart is local-first — your financial data stays on your device with local encryption, biometric login, and an incognito mode. Email verification secures your account and payments run through Stripe." },
];

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
  return (
    <nav className="nav">
      <Brand />
      <div className="nav-links">
        <a href="#features">Features</a>
        <a href="#pricing">Pricing</a>
        <a href="#download">Download</a>
        <a href="#status">Status</a>
        <a className="btn btn-primary" href="#download" style={{ padding: "8px 16px" }}>
          Get the app →
        </a>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <header className="hero">
      <div className="wrap">
        <div className="eyebrow">// personal finance, leveled up</div>
        <h1>
          Master your money.
          <br />
          <span className="accent">Cyber-clean.</span>
        </h1>
        <p>
          Budgets, goals, debt payoff, investments, and a true net worth.
          Track everything, owe less, build more.
        </p>
        <div className="hero-cta">
          <a className="btn btn-primary" href="#download">⤓ Download free</a>
          <a className="btn" href="#pricing">See pricing</a>
        </div>

        <div className="hero-stats">
          <div className="hero-stat">
            <div className="n mono">12</div>
            <div className="l">modules</div>
          </div>
          <div className="hero-stat">
            <div className="n mono">4</div>
            <div className="l">platforms</div>
          </div>
          <div className="hero-stat">
            <div className="n mono">$0</div>
            <div className="l">to start</div>
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
  return (
    <section id="features">
      <div className="wrap">
        <div className="eyebrow">// everything in one place</div>
        <h2 className="section-title">One app. Your whole financial life.</h2>
        <p className="section-sub">No spreadsheets, no five apps. BudgetSmart turns raw transactions into clarity.</p>
        <div className="grid grid-4" style={{ marginTop: 36 }}>
          {FEATURE_CARDS.map((f) => (
            <div className="card" key={f.title}>
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const groups: Array<{ key: string; label: string }> = [
    { key: "free", label: "Free" },
    { key: "individual", label: "Individual" },
    { key: "family", label: "Family — up to 5 people" },
    { key: "custom", label: "Custom" },
  ];
  return (
    <section id="pricing">
      <div className="wrap">
        <div className="eyebrow">// simple, honest pricing</div>
        <h2 className="section-title">Pick your tier.</h2>
        <p className="section-sub">Start free. Upgrade when you want goals, reports, investing, or a plan for the whole family.</p>
        <div className="pricing-groups">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="eyebrow" style={{ marginBottom: 12 }}>{g.label}</div>
              <div className="pricing-grid">
                {TIERS.filter((t) => t.group === g.key).map((t) => (
                  <PlanCard key={t.id} tier={t} />
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
  const granted = FEATURES.filter((f) => hasFeature(tier, f.key)).slice(0, 5);
  return (
    <div className={`plan ${tier.highlight ? "popular" : ""}`}>
      {tier.highlight && <span className="tag">POPULAR</span>}
      <span className="name">{tier.name}</span>
      <div className="price">
        {tier.priceCents === 0 ? "Free" : formatMoney(tier.priceCents)}
        {tier.priceCents > 0 && <small>{tier.interval === "once" ? " one-time" : " /mo"}</small>}
      </div>
      <div className="tagline">{tier.tagline}</div>
      <ul>
        {granted.map((f) => (
          <li key={f.key}>
            <span className="check">✓</span> {f.label}
          </li>
        ))}
        <li className="faint">up to {tier.memberLimit} member{tier.memberLimit === 1 ? "" : "s"}</li>
      </ul>
      <a className={`btn ${tier.highlight ? "btn-primary" : ""}`} href="/account">
        {tier.interval === "once" ? "Get the app" : "Choose plan"}
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
        <div className="eyebrow">// get the app</div>
        <h2 className="section-title">Download BudgetSmart.</h2>
        <p className="section-sub">Windows, Linux, and Android are available now — iOS and macOS are on the way.</p>
        <div className="dl-grid">
          {platforms.map((p) => (
            <div className="dl" key={p.os}>
              <div className="platform">{p.icon}</div>
              <div className="os">{p.os}</div>
              <div className="meta">{p.meta}</div>
              {p.file ? (
                <a className="btn btn-primary" href={p.file} download>⤓ Download</a>
              ) : (
                <span className="btn" aria-disabled="true" style={{ opacity: 0.5, pointerEvents: "none" }}>Coming soon</span>
              )}
            </div>
          ))}
        </div>
        <p className="section-sub" style={{ fontSize: 13, marginTop: 4 }}>
          Android is a direct APK — open it and allow “install from unknown sources.” Your financial data stays on your device.
        </p>
        <div className="apt-box">
          <div className="apt-title">🐧 Install on Debian / Ubuntu via apt</div>
          <pre className="apt-code"><code>{APT_INSTALL}</code></pre>
          <div className="apt-note">Signed repository — updates arrive through <code>apt upgrade</code>.</div>
        </div>
      </div>
    </section>
  );
}

function Status() {
  return (
    <section id="status">
      <div className="wrap">
        <div className="eyebrow">// system status</div>
        <h2 className="section-title">All systems operational.</h2>
        <div className="status-box">
          {STATUS.map((s) => (
            <div className="status-row" key={s.name}>
              <span>{s.name}</span>
              <span className="status-ok">
                <span className="status-pill" /> {s.note}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq">
      <div className="wrap">
        <div className="eyebrow">// questions</div>
        <h2 className="section-title">FAQ</h2>
        <div className="faq">
          {FAQS.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <Brand />
        <div className="faint">© {new Date().getFullYear()} BudgetSmart · {DOMAIN}</div>
        <div className="muted" style={{ display: "flex", gap: 18 }}>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#download">Download</a>
          <a href="#status">Status</a>
        </div>
      </div>
    </footer>
  );
}
