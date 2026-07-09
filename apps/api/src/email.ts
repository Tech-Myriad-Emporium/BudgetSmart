import { sendMailGmail } from "./smtp.js";
import type { Env } from "./types.js";

// Pluggable email sender. Prefers Gmail SMTP (App Password) via the Worker's TCP
// sockets; falls back to Resend's HTTP API; otherwise logs the link so
// verification stays testable before any provider is wired in.
async function send(env: Env, to: string, subject: string, html: string, text: string): Promise<boolean> {
  if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) {
    try {
      await sendMailGmail(env, { to, subject, html, text });
      return true;
    } catch (err) {
      console.error("gmail send failed:", String(err));
      return false;
    }
  }
  if (env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, html, text }),
    });
    if (!res.ok) {
      console.error("email send failed", res.status, await res.text());
      return false;
    }
    return true;
  }
  console.log(`[email:dev] to=${to} subject="${subject}"\n${text}`);
  return true;
}

const wrap = (title: string, body: string) => `<!doctype html><html><body style="margin:0;background:#000;color:#e6e6e6;font-family:system-ui,Segoe UI,Roboto,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:32px">
    <img src="https://budgetsmarttme.com/brand.png" alt="BudgetSmart" height="44" style="display:block;height:44px;margin-bottom:20px"/>
    <h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
    ${body}
    <p style="color:#7a7a7a;font-size:12px;margin-top:28px">If you didn't request this, you can ignore this email.</p>
  </div></body></html>`;

export function sendVerificationEmail(env: Env, to: string, name: string, link: string): Promise<boolean> {
  const greeting = name ? `Hi ${name},` : "Welcome!";
  const html = wrap(
    "Verify your email",
    `<p>${greeting}</p>
     <p>Confirm this address to activate your BudgetSmart account.</p>
     <p style="margin:24px 0"><a href="${link}" style="background:#00FF41;color:#000;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px;display:inline-block">Verify email</a></p>
     <p style="color:#9a9a9a;font-size:13px">Or paste this link into your browser:<br><span style="color:#00FF41">${link}</span></p>`,
  );
  const text = `${greeting}\n\nVerify your BudgetSmart email by opening this link:\n${link}\n`;
  return send(env, to, "Verify your BudgetSmart email", html, text);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const usd = (cents: number) =>
  `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface DigestPayload {
  month: string;
  /** When set, this is a weekly recap (e.g. "Jun 23 - Jun 29"). */
  weekLabel?: string | null;
  income: number;
  expenses: number;
  net: number;
  txCount: number;
  expenseDeltaPct: number | null;
  topCategories: Array<{ name: string; icon: string; amount: number }>;
  budgets: { count: number; overCount: number; totalLimit: number; totalSpent: number } | null;
  subscriptionCount: number;
  subscriptionMonthly: number;
  liquidBalance: number;
}

export function sendMonthlyDigestEmail(env: Env, to: string, name: string, d: DigestPayload): Promise<boolean> {
  const monthName = new Date(`${d.month}-15T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const weekly = !!d.weekLabel;
  const periodName = weekly ? esc(d.weekLabel!) : monthName;
  const vsLabel = weekly ? "week" : "month";
  const greeting = name ? `Hi ${esc(name)},` : "Hi,";
  const deltaLine =
    d.expenseDeltaPct === null
      ? ""
      : `<p style="color:${d.expenseDeltaPct > 0 ? "#ff5c5c" : "#00FF41"};font-size:13px;margin:4px 0 0">spending ${d.expenseDeltaPct > 0 ? "up" : "down"} ${Math.abs(Math.round(d.expenseDeltaPct * 100))}% vs the ${vsLabel} before</p>`;
  const row = (label: string, value: string, color = "#e6e6e6") =>
    `<tr><td style="padding:6px 0;color:#9a9a9a;font-size:13px">${label}</td><td align="right" style="padding:6px 0;color:${color};font-size:13px;font-weight:600">${value}</td></tr>`;

  const catRows = d.topCategories
    .map((c) => row(`${esc(c.icon)} ${esc(c.name)}`, usd(c.amount)))
    .join("");
  const budgetBlock = d.budgets
    ? `<h2 style="font-size:14px;margin:24px 0 4px">Budgets</h2><table width="100%" cellpadding="0" cellspacing="0">${row(
        `${d.budgets.count} budget${d.budgets.count === 1 ? "" : "s"} set`,
        `${usd(d.budgets.totalSpent)} of ${usd(d.budgets.totalLimit)}`,
      )}${d.budgets.overCount > 0 ? row("Over budget", `${d.budgets.overCount} categor${d.budgets.overCount === 1 ? "y" : "ies"}`, "#ff5c5c") : ""}</table>`
    : "";

  const html = wrap(
    weekly ? `Your week in money (${periodName})` : `Your ${monthName} money recap`,
    `<p>${greeting}</p>
     <p style="color:#9a9a9a;font-size:14px">Here's how ${weekly ? `the week of ${periodName}` : monthName} went (${d.txCount} transactions):</p>
     <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">
       ${row("Income", usd(d.income), "#00FF41")}
       ${row("Spending", usd(d.expenses), "#ff5c5c")}
       ${row("Net", usd(d.net), d.net >= 0 ? "#00FF41" : "#ff5c5c")}
       ${row("Liquid balance now", usd(d.liquidBalance))}
     </table>
     ${deltaLine}
     ${d.topCategories.length > 0 ? `<h2 style="font-size:14px;margin:24px 0 4px">Top spending</h2><table width="100%" cellpadding="0" cellspacing="0">${catRows}</table>` : ""}
     ${budgetBlock}
     ${d.subscriptionCount > 0 ? `<p style="color:#9a9a9a;font-size:13px;margin-top:24px">♻ ${d.subscriptionCount} subscriptions cost you about ${usd(d.subscriptionMonthly)}/mo.</p>` : ""}
     <p style="color:#7a7a7a;font-size:12px;margin-top:28px">Sent because monthly summaries are enabled in your BudgetSmart app — turn them off any time on the Plans page. Numbers are computed on your device.</p>`,
  );
  const text =
    `${greeting}\n\n${periodName} recap (${d.txCount} transactions):\n` +
    `Income ${usd(d.income)} · Spending ${usd(d.expenses)} · Net ${usd(d.net)}\n` +
    d.topCategories.map((c) => `  ${c.name}: ${usd(c.amount)}`).join("\n") +
    `\n\nSent by BudgetSmart — disable monthly summaries in the app.`;
  return send(env, to, `📊 Your ${weekly ? periodName : monthName} BudgetSmart recap`, html, text);
}

export function sendFamilyInviteEmail(env: Env, to: string, inviterName: string, link: string): Promise<boolean> {
  const who = inviterName || "Someone";
  const html = wrap(
    `${who} shared their BudgetSmart plan with you`,
    `<p><strong>${who}</strong> has invited you to share their BudgetSmart plan.</p>
     <p>Accept to unlock all of their plan's premium features on your own account — nothing to pay.</p>
     <p style="margin:24px 0"><a href="${link}" style="background:#00FF41;color:#000;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px;display:inline-block">Accept & unlock</a></p>
     <p style="color:#9a9a9a;font-size:13px">Or paste this link into your browser:<br><span style="color:#00FF41">${link}</span></p>
     <p style="color:#9a9a9a;font-size:13px">Sign in (or create a free account) with <strong>${to}</strong> to accept. This invite expires in 14 days.</p>`,
  );
  const text = `${who} shared their BudgetSmart plan with you.\n\nAccept here:\n${link}\n\nSign in (or create a free account) with ${to} to accept. Expires in 14 days.\n`;
  return send(env, to, `${who} shared their BudgetSmart plan with you`, html, text);
}

/* ------------------------------------------------------------------ *
 * Custom / Enterprise: order receipt, then the redeemable code once paid.
 * ------------------------------------------------------------------ */
export interface OrderReceipt {
  ref: string;
  planType: string; // custom | enterprise
  seats: number;
  itemLabels: string[];
  perPersonYear: number; // USD
  blockFee: number; // USD
  total: number; // USD / yr
  payUrl?: string; // set once card processing is live; until then, instructions
}

export function sendOrderReceiptEmail(env: Env, to: string, name: string, r: OrderReceipt): Promise<boolean> {
  const greeting = name ? `Hi ${esc(name)},` : "Hi,";
  const planName = r.planType === "enterprise" ? "Enterprise" : "Custom";
  const paid = !!r.payUrl;
  const line = (label: string, value: string, color = "#e6e6e6") =>
    `<tr><td style="padding:6px 0;color:#9a9a9a;font-size:13px">${label}</td><td align="right" style="padding:6px 0;color:${color};font-size:13px;font-weight:600">${value}</td></tr>`;
  const featureRows = r.itemLabels.map((l) => `<li style="margin:4px 0;color:#cfcfcf;font-size:13px">${esc(l)}</li>`).join("");
  const money = (n: number) => `$${n.toLocaleString("en-US")}`;
  const payBlock = paid
    ? `<p style="margin:22px 0"><a href="${r.payUrl}" style="background:#00FF41;color:#000;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:8px;display:inline-block">Pay ${money(r.total)} securely →</a></p>
       <p style="color:#9a9a9a;font-size:12px;margin:-8px 0 0">Secure checkout by Stripe. The moment your payment clears, your redemption code is emailed to you automatically.</p>`
    : `<p style="color:#cfcfcf;font-size:13px;margin:18px 0 6px">To pay, reply to this email and we'll send a secure invoice. We reply to every order within 24 hours.</p>`;

  const html = wrap(
    paid ? `Complete your ${planName} order — ${esc(r.ref)}` : `Your ${planName} plan quote — ${esc(r.ref)}`,
    `<p>${greeting}</p>
     <p style="color:#9a9a9a;font-size:14px">Thanks for building a ${planName} BudgetSmart plan. Here's your order (<strong style="color:#00FF41">${esc(r.ref)}</strong>):</p>
     <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">
       ${line("Plan", `${planName} · annual`)}
       ${line("Seats", String(r.seats))}
       ${line("Per person / year", money(r.perPersonYear))}
       ${line("Setup & support", `+ ${money(r.blockFee)}`)}
       ${line("Annual total", money(r.total), "#00FF41")}
     </table>
     <h2 style="font-size:14px;margin:22px 0 6px">Included capabilities</h2>
     <ul style="margin:0;padding-left:18px">${featureRows}</ul>
     ${payBlock}
     <p style="color:#9a9a9a;font-size:13px;margin-top:20px">Your code unlocks the plan at
       <span style="color:#00FF41">budgetsmarttme.com/account</span> (or in the app) and lets you share seats with your team by email.</p>
     <p style="color:#7a7a7a;font-size:12px;margin-top:24px">Keep ${esc(r.ref)} for your records. Annual billing only.</p>`,
  );
  const text =
    `${greeting}\n\n${planName} BudgetSmart plan — order ${r.ref}\n` +
    `Seats: ${r.seats}\nPer person/year: ${money(r.perPersonYear)}\nSetup & support: +${money(r.blockFee)}\nAnnual total: ${money(r.total)}\n\n` +
    `Included:\n${r.itemLabels.map((l) => `  - ${l}`).join("\n")}\n\n` +
    (paid
      ? `Pay securely here: ${r.payUrl}\nThe moment your payment clears, your redemption code is emailed to you automatically.\n`
      : `To pay, reply to this email for a secure invoice. We reply within 24 hours.\n`) +
    `\nYour code unlocks the plan at budgetsmarttme.com/account and lets you share seats by email.\n`;
  return send(
    env,
    to,
    paid ? `Complete your ${planName} BudgetSmart order (${r.ref})` : `Your ${planName} BudgetSmart plan quote (${r.ref})`,
    html,
    text,
  );
}

/** Plain, high-signal security alert to the operator's inbox. */
export function sendSecurityAlertEmail(env: Env, to: string, subject: string, lines: string[]): Promise<boolean> {
  const rows = lines.map((l) => `<div style="font-family:ui-monospace,Menlo,monospace;font-size:13px;color:#cfcfcf;margin:2px 0">${esc(l)}</div>`).join("");
  const html = wrap(
    "Security alert",
    `<p style="color:#ff5c5c;font-weight:700;margin:0 0 12px">A critical security event was recorded.</p>
     ${rows}
     <p style="color:#9a9a9a;font-size:12px;margin-top:20px">Review the event log: <span style="color:#00FF41">GET /admin/security/events</span> with your admin token. If this wasn't expected, consider enabling lockdown.</p>`,
  );
  const text = `SECURITY ALERT\n\n${lines.join("\n")}\n\nReview: GET /admin/security/events (admin token).`;
  return send(env, to, subject, html, text);
}

export interface AttackAlert {
  compromise: boolean; // true = possible account compromise; false = blocked attack
  type: string;
  whenIso: string;
  ip: string;
  country?: string;
  city?: string;
  region?: string;
  asn?: number;
  asOrg?: string;
  timezone?: string;
  userAgent?: string;
  userId?: string | null;
  path?: string;
  relatedFromSource: number;
}

/** "An attack was launched" alert with an account-status assessment and the
 *  source trace police would need. Honest about geolocation limits. */
export function sendAttackAlertEmail(env: Env, to: string, a: AttackAlert): Promise<boolean> {
  const location = [a.city, a.region, a.country].filter(Boolean).join(", ") || "unknown";
  const statusColor = a.compromise ? "#ff5c5c" : "#00FF41";
  const statusHead = a.compromise ? "⚠️ ACCOUNTS MAY BE COMPROMISED" : "🛡️ ATTACK DETECTED & BLOCKED";
  const statusBody = a.compromise
    ? `A sign-in to ${a.userId ? `account <b>${esc(a.userId)}</b>` : "an account"} succeeded from a new location. If this wasn't you or the account holder, treat it as a compromise: the user has been notified, and you should force a password reset and confirm two-factor. Consider enabling lockdown.`
    : `The activity below was <b>stopped by the defenses</b> — the attacker was blocked and <b>no unauthorized account access was detected</b>. Your accounts appear secure. Nothing is required, but the evidence is logged in case you want to escalate.`;

  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#9a9a9a;font-size:13px;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0;color:#e6e6e6;font-size:13px;font-family:ui-monospace,Menlo,monospace">${esc(v)}</td></tr>`;

  const html = wrap(
    "Security alert — attack detected",
    `<p style="color:${statusColor};font-weight:700;font-size:15px;margin:0 0 8px">${statusHead}</p>
     <p style="color:#cfcfcf;font-size:14px;line-height:1.6;margin:0 0 18px">${statusBody}</p>
     <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:0.08em;color:#9a9a9a;margin:0 0 6px">Source trace</h2>
     <table cellpadding="0" cellspacing="0">
       ${row("Source IP", a.ip)}
       ${row("Location", location)}
       ${row("ISP / network", `${a.asOrg ?? "unknown"} (ASN ${a.asn ?? "?"})`)}
       ${a.timezone ? row("Timezone", a.timezone) : ""}
       ${a.userAgent ? row("Device / agent", a.userAgent) : ""}
       ${row("Activity", a.type)}
       ${a.path ? row("Endpoint", a.path) : ""}
       ${row("From this source (15m)", `${a.relatedFromSource} events`)}
       ${row("When (UTC)", a.whenIso)}
     </table>
     <p style="color:#9a9a9a;font-size:12px;line-height:1.6;margin:18px 0 0">
       Geolocation is approximate — attackers often relay through VPNs, Tor or compromised hosts, so this IP identifies
       the connection, not necessarily a person. For a police referral, pull the full evidence report
       (<span style="color:#00FF41">GET /admin/security/report?format=text</span> with your admin token); the ISP/ASN
       above is who law enforcement would serve to identify the subscriber behind this IP at these timestamps.
     </p>`,
  );
  const text =
    `${statusHead}\n\n${a.compromise ? "Possible account compromise." : "Attack blocked. No unauthorized access detected — accounts appear secure."}\n\n` +
    `SOURCE TRACE\n  IP: ${a.ip}\n  Location: ${location}\n  ISP/network: ${a.asOrg ?? "unknown"} (ASN ${a.asn ?? "?"})\n` +
    `  Activity: ${a.type}\n  Endpoint: ${a.path ?? "-"}\n  From this source (15m): ${a.relatedFromSource} events\n  When (UTC): ${a.whenIso}\n\n` +
    `Geolocation is approximate (VPN/Tor/proxy). Full evidence for police: GET /admin/security/report?format=text (admin token). ` +
    `The ISP/ASN is who law enforcement subpoenas to identify the subscriber.`;
  return send(env, to, a.compromise ? "⚠️ BudgetSmart: possible account compromise" : "🛡️ BudgetSmart: attack detected & blocked", html, text);
}

export interface CodeGrant {
  code: string;
  planLabel: string; // e.g. "Enterprise (40 seats)"
  seats: number;
}

export function sendRedemptionCodeEmail(env: Env, to: string, name: string, g: CodeGrant): Promise<boolean> {
  const greeting = name ? `Hi ${esc(name)},` : "Hi,";
  const share = g.seats > 1
    ? `<p style="color:#9a9a9a;font-size:13px">Your plan covers <strong>${g.seats} people</strong>. After redeeming, invite the rest of your team by email from your account — they unlock everything instantly, no extra cost.</p>`
    : "";
  const html = wrap(
    "Your BudgetSmart redemption code 🎉",
    `<p>${greeting}</p>
     <p>Payment received — thank you! Your <strong>${esc(g.planLabel)}</strong> plan is ready to unlock.</p>
     <div style="margin:22px 0;text-align:center">
       <div style="display:inline-block;background:#0d0d0d;border:1px solid #00FF41;border-radius:10px;padding:16px 24px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:22px;letter-spacing:2px;color:#00FF41">${esc(g.code)}</div>
     </div>
     <p style="color:#9a9a9a;font-size:13px">Redeem it at <span style="color:#00FF41">budgetsmarttme.com/account</span> → <strong>Redeem a code</strong> (or in the app under Plans). Sign in first, then paste the code.</p>
     ${share}
     <p style="color:#7a7a7a;font-size:12px;margin-top:24px">This code can only be redeemed once. Keep it private — it unlocks a paid plan.</p>`,
  );
  const text =
    `${greeting}\n\nPayment received. Your ${g.planLabel} plan is ready.\n\n` +
    `Redemption code: ${g.code}\n\n` +
    `Redeem it at budgetsmarttme.com/account → Redeem a code (or in the app). ` +
    (g.seats > 1 ? `Your plan covers ${g.seats} people — invite your team by email after redeeming.\n` : "\n");
  return send(env, to, "🎉 Your BudgetSmart redemption code", html, text);
}
