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
    <div style="font-size:20px;font-weight:700;color:#00FF41;margin-bottom:20px">Budget<span style="color:#e6e6e6">Smart</span></div>
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
  const greeting = name ? `Hi ${esc(name)},` : "Hi,";
  const deltaLine =
    d.expenseDeltaPct === null
      ? ""
      : `<p style="color:${d.expenseDeltaPct > 0 ? "#ff5c5c" : "#00FF41"};font-size:13px;margin:4px 0 0">spending ${d.expenseDeltaPct > 0 ? "up" : "down"} ${Math.abs(Math.round(d.expenseDeltaPct * 100))}% vs the month before</p>`;
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
    `Your ${monthName} money recap`,
    `<p>${greeting}</p>
     <p style="color:#9a9a9a;font-size:14px">Here's how ${monthName} went (${d.txCount} transactions):</p>
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
    `${greeting}\n\n${monthName} recap (${d.txCount} transactions):\n` +
    `Income ${usd(d.income)} · Spending ${usd(d.expenses)} · Net ${usd(d.net)}\n` +
    d.topCategories.map((c) => `  ${c.name}: ${usd(c.amount)}`).join("\n") +
    `\n\nSent by BudgetSmart — disable monthly summaries in the app.`;
  return send(env, to, `📊 Your ${monthName} BudgetSmart recap`, html, text);
}

export function sendFamilyInviteEmail(env: Env, to: string, inviterName: string, link: string): Promise<boolean> {
  const who = inviterName || "Someone";
  const html = wrap(
    `You've been invited to join ${who}'s family`,
    `<p><strong>${who}</strong> has invited you to join their BudgetSmart family plan.</p>
     <p>Accept to share the family's premium features — shared budgets, goals and more.</p>
     <p style="margin:24px 0"><a href="${link}" style="background:#00FF41;color:#000;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px;display:inline-block">Accept invite</a></p>
     <p style="color:#9a9a9a;font-size:13px">Or paste this link into your browser:<br><span style="color:#00FF41">${link}</span></p>
     <p style="color:#9a9a9a;font-size:13px">Sign in (or create a free account) with <strong>${to}</strong> to accept. This invite expires in 14 days.</p>`,
  );
  const text = `${who} has invited you to join their BudgetSmart family plan.\n\nAccept here:\n${link}\n\nSign in (or create a free account) with ${to} to accept. Expires in 14 days.\n`;
  return send(env, to, `You're invited to join ${who}'s BudgetSmart family`, html, text);
}
