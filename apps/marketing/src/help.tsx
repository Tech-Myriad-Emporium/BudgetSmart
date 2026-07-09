// Help Center: self-serve guides, written for people who never learned money
// software (or money). This is deliberately NOT a support desk — there's no
// ticket queue behind it. Every page answers the question by itself.
import { useEffect, useMemo, useState } from "react";
import { Footer, Nav } from "./App";

const ORDER_EMAIL = "budgetsmart.techmyriademporium@gmail.com";

interface HelpArticle {
  slug: string;
  category: string;
  title: string;
  summary: string;
  body: React.ReactNode;
}

const CATEGORIES = [
  "Getting started",
  "Using the app",
  "Plans & billing",
  "Sharing & teams",
  "Your data",
  "Fixes",
] as const;

/* ------------------------------------------------------------------ *
 * The articles. Plain words, short sentences, no jargon.
 * ------------------------------------------------------------------ */
const A = ({ children }: { children: React.ReactNode }) => <div className="help-body">{children}</div>;

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "install",
    category: "Getting started",
    title: "Download & install on any device",
    summary: "Windows, Mac, Linux, Android and iPhone — and what to do when your computer warns you about the installer.",
    body: (
      <A>
        <p>Grab the app from the <a href="/#download">Download section</a>. Pick your device:</p>
        <ul>
          <li><b>Windows</b> — download <code>BudgetSmart-Setup.exe</code> and run it.</li>
          <li><b>Mac</b> — pick Apple&nbsp;Silicon (M1 or newer) or Intel, open the <code>.dmg</code>, drag BudgetSmart into Applications.</li>
          <li><b>Linux</b> — the AppImage runs on any distro: make it executable and double-click. Debian/Ubuntu can use our <code>apt</code> repo instead (commands are under the download buttons).</li>
          <li><b>Android</b> — download the APK. Your phone will ask you to allow installs from your browser; that's normal for apps outside the Play Store.</li>
          <li><b>iPhone</b> — this one's for tinkerers: the <code>.ipa</code> installs through a sideloading tool like AltStore or Sideloadly. If those words are new to you, start with their guides first.</li>
        </ul>
        <h3>"Windows protected your PC" — is this safe?</h3>
        <p>
          Yes. That blue SmartScreen warning appears because BudgetSmart is a new app that isn't yet code-signed —
          not because anything is wrong with it. Click <b>More info → Run anyway</b>. On a Mac the same idea shows up as
          "unidentified developer": right-click the app → <b>Open</b> → <b>Open</b> again.
        </p>
      </A>
    ),
  },
  {
    slug: "first-steps",
    category: "Getting started",
    title: "Your first 10 minutes",
    summary: "The three moves that make BudgetSmart useful on day one.",
    body: (
      <A>
        <p>When you first open the app, it walks you through this — but here's the map:</p>
        <ul>
          <li><b>1. Add an account.</b> An account is just a bucket that holds money: checking, savings, or cash. A rough balance guess is fine — you can fix it any time.</li>
          <li><b>2. Set your first goal.</b> Start tiny: save $100. A goal gives your money one clear job, and the app tracks it for you.</li>
          <li><b>3. Grab your reward.</b> Finishing setup levels you up and unlocks the Rewards tab — free, forever. Good money habits earn XP from then on.</li>
        </ul>
        <p>
          After that, add spending as it happens (it takes seconds), or jump ahead: import a bank statement
          (<a href="/help/import-statement">how</a>) or schedule your bills and paychecks
          (<a href="/help/scheduled-charges">how</a>) so the app starts thinking ahead for you.
        </p>
      </A>
    ),
  },
  {
    slug: "import-statement",
    category: "Getting started",
    title: "Import your bank statements",
    summary: "Get months of history in at once — the app sorts it for you.",
    body: (
      <A>
        <p>
          Instead of typing history by hand, download a statement file from your bank and drop it on the
          <b> Import</b> tab. BudgetSmart reads <b>CSV, OFX, QFX and QIF</b> files, sorts each transaction into a
          category using your own history, and skips anything you already have — so importing twice never doubles things up.
        </p>
        <h3>Where do I get that file?</h3>
        <p>
          Sign in to your bank's website (not the phone app — it usually hides this), open your account's transaction
          list, and look for <b>Download</b>, <b>Export</b> or a small file icon. Choose CSV if you're given a choice
          of formats, and the longest date range they offer.
        </p>
        <p>
          Importing needs a Tier 1 plan or the free trial. Direct bank connections — where the app pulls
          transactions in automatically — are on our roadmap.
        </p>
      </A>
    ),
  },
  {
    slug: "scheduled-charges",
    category: "Using the app",
    title: "Schedule bills, paychecks & one-offs",
    summary: "Tell the app what's coming and when — it can even record it for you automatically.",
    body: (
      <A>
        <p>
          On the <b>Calendar</b> tab, hit <b>+ Schedule a charge</b>. Three kinds:
        </p>
        <ul>
          <li><b>Recurring</b> — rent, subscriptions, paychecks. Weekly, every 2 weeks, monthly or yearly, starting on the exact date you pick.</li>
          <li><b>One-time</b> — a single known charge on a single date (that dentist bill next month).</li>
          <li><b>Custom</b> — repeats every N days, for anything with an odd rhythm.</li>
        </ul>
        <p>
          Mark it as a <b>charge or income</b>, and leave <b>auto-post</b> on if you want the app to add it to your
          transactions by itself when the day arrives — no typing. Scheduled items show on the calendar grid and
          feed the 90-day Forecast, so the app can warn you about a tight week before it happens.
        </p>
      </A>
    ),
  },
  {
    slug: "budgets",
    category: "Using the app",
    title: "Budgets, sub-categories & Safe-to-Spend",
    summary: "Give every category a monthly limit and let the app do the math.",
    body: (
      <A>
        <p>
          A budget is a monthly limit for one category — say, $400 for groceries. Set them on the <b>Budgets</b> tab.
          You can nest <b>sub-categories</b> (Groceries → Snacks) to see where a category really goes.
        </p>
        <ul>
          <li><b>Rollover</b> — money you didn't spend this month carries into next month's limit.</li>
          <li><b>Safe-to-Spend</b> — the dashboard number that answers "can I afford this right now?" after your bills and budgets are covered.</li>
          <li><b>Auto-suggestions</b> — the Insights tab (Tier 1) reads your real spending and proposes budgets with one click.</li>
        </ul>
        <p>Start with three budgets, not fifteen. The ones you'll actually check beat a perfect system you'll abandon.</p>
      </A>
    ),
  },
  {
    slug: "goals-debt",
    category: "Using the app",
    title: "Goals & paying off debt",
    summary: "Save toward things, and kill debts in the smartest order.",
    body: (
      <A>
        <p>
          <b>Goals</b> give money a job: an emergency fund, a trip, a first $100. The app shows your pace and the
          date you'll finish at your current rate.
        </p>
        <p>
          <b>Debt</b> plans the payoff for you. Enter each debt's balance, interest rate (APR) and minimum payment,
          then pick a strategy:
        </p>
        <ul>
          <li><b>Snowball</b> — smallest balance first. Quick wins, great for motivation.</li>
          <li><b>Avalanche</b> — highest interest first. Mathematically cheapest.</li>
        </ul>
        <p>
          Either way the app shows your debt-free date, the total interest you'll pay, and how much faster any extra
          monthly payment gets you there. The <b>Credit</b> tab does the same for a single credit card — including an
          estimate of the credit-score points you could gain by paying it down.
        </p>
      </A>
    ),
  },
  {
    slug: "forecast",
    category: "Using the app",
    title: "Reading your Forecast",
    summary: "The 90-day projection: what it knows, and why it might look empty.",
    body: (
      <A>
        <p>
          The <b>Forecast</b> tab (Tier 2) projects your balance 90 days ahead using three ingredients: your detected
          or scheduled <b>bills</b>, your detected or scheduled <b>income</b>, and your typical daily spending. It flags
          the lowest point, warns if you'd dip below zero, and computes a <b>safe daily pace</b> until your next paycheck.
        </p>
        <h3>Why is mine empty?</h3>
        <p>
          The forecast needs fuel. Give it any of these and it lights up: an account with a balance, a few weeks of
          transactions (imported or typed), or scheduled bills and paychecks from the Calendar tab — scheduling is the
          fastest, since the app then knows exact amounts on exact dates instead of guessing from history.
        </p>
      </A>
    ),
  },
  {
    slug: "plans",
    category: "Plans & billing",
    title: "Plans, pricing & the free trial",
    summary: "What's free, what each tier adds, and how the 7-day trial works.",
    body: (
      <A>
        <p>
          The <b>Base app is free forever</b>: accounts, transactions, budgets, goals, debt planning, rewards and CSV
          export, all offline on your device. Paid tiers add automation:
        </p>
        <ul>
          <li><b>Tier 1</b> — statement import, subscription detection, smart cleanup, reports, calendar, email recaps.</li>
          <li><b>Tier 2</b> — investments with live prices, net worth, the 90-day forecast, AI insights.</li>
          <li><b>Tier 3</b> — tax intelligence, money intelligence, audit trail, the works.</li>
          <li><b>Family plans</b> — the same tiers for up to 5 people, shared by email.</li>
        </ul>
        <p>
          Every new account gets a <b>7-day Tier 3 trial</b> — no card, nothing renews, it just ends. Subscribe at{" "}
          <a href="/account">your account page</a>, then connect the app on its Plans tab and your features unlock.
          Current prices are on the <a href="/#pricing">pricing section</a>.
        </p>
      </A>
    ),
  },
  {
    slug: "redeem-code",
    category: "Plans & billing",
    title: "Redeem a code",
    summary: "Turn a BSMART-XXXX-XXXX code into an active plan.",
    body: (
      <A>
        <p>
          Codes look like <code>BSMART-XXXX-XXXX</code> and arrive by email after a Custom or Enterprise purchase
          (or as a gift). To use one:
        </p>
        <ul>
          <li>Sign in at <a href="/account">budgetsmarttme.com/account</a> — create a free account first if you don't have one.</li>
          <li>Find the <b>Redeem a code</b> box, paste your code, hit Redeem.</li>
          <li>Your plan activates instantly. If it's a team code, invite people by email under <b>Sharing</b> on the same page.</li>
        </ul>
        <p>
          A code works exactly once. "Already been redeemed" means it's active on the account that used it first.
          Dashes and lowercase don't matter — <code>bsmartxxxxxxxx</code> works too.
        </p>
      </A>
    ),
  },
  {
    slug: "custom-orders",
    category: "Plans & billing",
    title: "Custom & Enterprise orders",
    summary: "Build a plan for your team: pick features, pay once a year, share by email.",
    body: (
      <A>
        <p>
          Teams of 6+ build their own plan at <a href="/build">budgetsmarttme.com/build</a>: tick the features you
          want, set your seat count, and the price updates live — the more features, the higher the per-person band.
          30+ seats is Enterprise. Annual billing only.
        </p>
        <p>The flow after you submit:</p>
        <ul>
          <li>A receipt lands in your inbox immediately, with a secure checkout link.</li>
          <li>The moment payment clears, your <b>redemption code</b> is emailed automatically.</li>
          <li><a href="/help/redeem-code">Redeem it</a>, then invite your whole team by email — they unlock everything at no extra cost.</li>
        </ul>
        <p>
          No email? Check spam/junk — our mail comes from <code>{ORDER_EMAIL}</code>. Order and billing
          questions to that address get a reply within 24 hours.
        </p>
      </A>
    ),
  },
  {
    slug: "sharing",
    category: "Sharing & teams",
    title: "Share your plan by email",
    summary: "Family and team plans cover several people — here's how invites work.",
    body: (
      <A>
        <p>
          If your plan covers more than one person (Family plans cover 5; Custom/Enterprise cover your seat count),
          you share it from <a href="/account">your account page</a> under <b>Sharing</b>: type their email, hit Invite.
        </p>
        <ul>
          <li>They get an email with an <b>Accept</b> link. It expires in 14 days.</li>
          <li>They must sign in (or create a free account) <b>with the exact email you invited</b>.</li>
          <li>Once they accept, every feature of your plan unlocks on their account — at no extra cost, on their own devices, with their own private data.</li>
        </ul>
        <p>
          Invite not arriving? It comes from <code>{ORDER_EMAIL}</code> — spam and junk folders love it.
          You can revoke a pending invite or remove a member any time; they keep their data, just not the paid features.
        </p>
      </A>
    ),
  },
  {
    slug: "master-view",
    category: "Sharing & teams",
    title: "The Master tab (plan owners)",
    summary: "One view of everything everyone has — without seeing their transactions.",
    body: (
      <A>
        <p>
          If you own a shared plan, the app gives you a <b>Master</b> tab: one card per member with their net worth,
          cash, 30-day money-in/money-out, budget status and goal progress — plus household totals across everyone.
        </p>
        <p>
          <b>Privacy is built in.</b> Each member's app shares only those headline numbers. Their individual
          transactions, merchants and notes never leave their device, and nobody but the plan owner sees the overview.
          A member's card says "waiting to sync" until they've opened their app while signed in.
        </p>
      </A>
    ),
  },
  {
    slug: "data-privacy",
    category: "Your data",
    title: "Where your data lives",
    summary: "On your device. Here's exactly what leaves it, and how to take your data with you.",
    body: (
      <A>
        <p>
          BudgetSmart is local-first: your transactions, budgets and goals live in a database <b>on your own device</b>,
          and the core app works with no internet at all. The only things that leave are the ones you turn on:
        </p>
        <ul>
          <li><b>Plan sync</b> — checking which subscription your account has.</li>
          <li><b>Email recaps</b> — if enabled, the app sends the summary numbers (not transactions) so we can email them to you.</li>
          <li><b>Master view</b> — on shared plans, headline numbers only (see <a href="/help/master-view">how that works</a>).</li>
          <li><b>Live prices</b> — the app asks for market prices; it sends ticker symbols, nothing about you.</li>
        </ul>
        <p>
          Want out? <b>Settings → Export CSV</b> downloads every transaction in a file Excel or Google Sheets opens.
          No lock-in, no exit fee, no dark patterns.
        </p>
      </A>
    ),
  },
  {
    slug: "updates",
    category: "Fixes",
    title: "Updating BudgetSmart",
    summary: "How the app tells you about new versions, and how to install them.",
    body: (
      <A>
        <p>
          The app checks for new versions on launch and every few hours. When one exists you'll see an update notice —
          in the app's sidebar and as a dialog on desktop. Updating is just: download the new installer from the link
          (or the <a href="/#download">Download section</a>) and run it over your existing install.
        </p>
        <p>
          <b>Your data survives updates.</b> It lives in its own folder, separate from the app — installing a new
          version never touches it. The version you're on is shown in the sidebar and under Settings → About.
        </p>
        <p>On Linux with the apt repo, <code>sudo apt upgrade</code> handles it like any other package.</p>
      </A>
    ),
  },
  {
    slug: "troubleshooting",
    category: "Fixes",
    title: "Common fixes",
    summary: "The quick answers: app won't open, sign-in emails missing, prices stale, invite trouble.",
    body: (
      <A>
        <h3>The verification / invite email never came</h3>
        <p>
          Check spam and junk — our emails come from <code>{ORDER_EMAIL}</code> and new senders often land there.
          Signing in again re-sends the verification link automatically.
        </p>
        <h3>The app won't open after install</h3>
        <p>
          Windows: don't run it from inside the ZIP/installer window — install first, then use the Start-menu shortcut.
          If SmartScreen blocked it, see <a href="/help/install">installing</a>. Still stuck: restart the computer once
          (seriously — it clears a locked file more often than anyone admits).
        </p>
        <h3>Investment prices look stale</h3>
        <p>
          Prices update automatically every few minutes <b>while you're online</b>, and the US market is closed nights
          and weekends — a Saturday price is Friday's close, which is correct. The Investments tab shows when prices
          last refreshed, plus a ⟳ button to force it.
        </p>
        <h3>My subscription isn't showing in the app</h3>
        <p>
          Open the app's <b>Plans</b> tab and connect the same account you subscribed with on the website — then
          reload. The app re-checks your plan every time it starts.
        </p>
      </A>
    ),
  },
];

const bySlug = new Map(HELP_ARTICLES.map((a) => [a.slug, a]));

/* ------------------------------------------------------------------ *
 * Pages
 * ------------------------------------------------------------------ */
function SelfServeNote() {
  return (
    <p className="help-note">
      BudgetSmart is self-serve — these guides <em>are</em> the help desk, and they're the fastest answer you'll get.
      For <b>order & billing</b> matters only: <a href={`mailto:${ORDER_EMAIL}`}>{ORDER_EMAIL}</a> (answered within 24 hours).
    </p>
  );
}

export function HelpIndexPage() {
  const [q, setQ] = useState("");
  useEffect(() => { document.title = "Help — BudgetSmart"; }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return HELP_ARTICLES;
    return HELP_ARTICLES.filter((a) =>
      `${a.title} ${a.summary} ${a.category}`.toLowerCase().includes(needle),
    );
  }, [q]);

  return (
    <>
      <Nav />
      <section style={{ paddingTop: 40 }}>
        <div className="wrap">
          <div className="eyebrow">// help</div>
          <h1 className="section-title">How can we point you in the right direction?</h1>
          <p className="section-sub">
            Short, plain-language guides to everything in BudgetSmart. No hold music, no chatbot — the answer is just… here.
          </p>

          <input
            className="help-search"
            type="search"
            placeholder="Search the guides… (e.g. import, code, invite)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />

          {filtered.length === 0 && (
            <p className="section-sub" style={{ marginTop: 24 }}>
              Nothing matched “{q}”. Try a shorter word — or scan the sections below.
            </p>
          )}

          {CATEGORIES.map((cat) => {
            const items = filtered.filter((a) => a.category === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat} style={{ marginTop: 36 }}>
                <div className="eyebrow" style={{ marginBottom: 12 }}>{cat}</div>
                <div className="help-grid">
                  {items.map((a) => (
                    <a key={a.slug} className="card help-card" href={`/help/${a.slug}`}>
                      <h3>{a.title}</h3>
                      <p>{a.summary}</p>
                    </a>
                  ))}
                </div>
              </div>
            );
          })}

          <div style={{ marginTop: 44 }}>
            <SelfServeNote />
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}

export function HelpArticlePage({ slug }: { slug: string }) {
  const article = bySlug.get(slug);
  useEffect(() => {
    document.title = article ? `${article.title} — BudgetSmart Help` : "Help — BudgetSmart";
  }, [article]);

  if (!article) {
    return (
      <>
        <Nav />
        <section style={{ paddingTop: 40 }}>
          <div className="wrap">
            <div className="eyebrow">// help</div>
            <h1 className="section-title">That guide doesn't exist (yet).</h1>
            <p className="section-sub">It may have moved. Everything we have is on the help page.</p>
            <a className="btn btn-primary" href="/help">← All guides</a>
          </div>
        </section>
        <Footer />
      </>
    );
  }

  const related = HELP_ARTICLES.filter((a) => a.category === article.category && a.slug !== article.slug).slice(0, 3);

  return (
    <>
      <Nav />
      <section style={{ paddingTop: 40 }}>
        <div className="wrap help-article">
          <div className="eyebrow">
            <a href="/help" style={{ color: "inherit" }}>// help</a> · {article.category.toLowerCase()}
          </div>
          <h1 className="section-title">{article.title}</h1>
          {article.body}

          <SelfServeNote />

          {related.length > 0 && (
            <div style={{ marginTop: 36 }}>
              <div className="eyebrow" style={{ marginBottom: 12 }}>More in {article.category.toLowerCase()}</div>
              <div className="help-grid">
                {related.map((a) => (
                  <a key={a.slug} className="card help-card" href={`/help/${a.slug}`}>
                    <h3>{a.title}</h3>
                    <p>{a.summary}</p>
                  </a>
                ))}
              </div>
            </div>
          )}

          <p style={{ marginTop: 32 }}>
            <a className="btn" href="/help">← All guides</a>
          </p>
        </div>
      </section>
      <Footer />
    </>
  );
}
