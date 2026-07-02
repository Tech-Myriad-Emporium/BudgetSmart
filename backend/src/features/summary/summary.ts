// Monthly email digest: numbers are computed HERE (locally) and only the
// structured summary is posted to the central API, which renders and sends
// the email from the bot Gmail to the linked account's address.
import { buildMonthlyDigest, resolveEntitlements } from "@budgetsmart/shared";
import { env } from "../../env.js";
import { accounts, budgets, categories, centralLink, emailPrefs, transactions, users } from "../../db/repo.js";
import { computeBalancesForUser } from "../../lib/balances.js";
import { effectiveTier } from "../../lib/entitlement.js";
import { serializeAccount, serializeBudget, serializeCategory, serializeTransaction } from "../../lib/serialize.js";

/** The last full month as YYYY-MM (in July that's June). */
export function lastFullMonth(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
}

export interface SendResult {
  ok: boolean;
  status: number;
  error?: string;
  sentTo?: string;
}

/** Build the digest for `month` and ask the central API to email it. */
export async function buildAndSendDigest(userId: string, month: string): Promise<SendResult> {
  const link = centralLink.get(userId);
  if (!link) return { ok: false, status: 400, error: "Connect your BudgetSmart account first — the summary is emailed to it." };

  const balances = computeBalancesForUser(userId);
  const digest = buildMonthlyDigest({
    transactions: transactions.allByUser(userId).map(serializeTransaction),
    categories: categories.listByUser(userId).map(serializeCategory),
    accounts: accounts.listByUser(userId, { activeOnly: true }).map((a) => serializeAccount(a, balances.get(a.id) ?? a.openingBalance)),
    budgets: budgets.listByUserMonth(userId, month).map(serializeBudget),
    month,
  });

  try {
    const res = await fetch(`${env.centralApiUrl}/email/monthly-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${link.token}` },
      body: JSON.stringify(digest),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; sentTo?: string };
    if (!res.ok) return { ok: false, status: res.status, error: data.error ?? "The email service couldn't send the summary." };
    emailPrefs.markSent(userId, month);
    return { ok: true, status: 200, sentTo: data.sentTo };
  } catch {
    return { ok: false, status: 502, error: "Couldn't reach the email service — are you online?" };
  }
}

/**
 * Auto-send pass: for every opted-in, entitled, linked user whose last full
 * month hasn't been summarized yet, send it. Runs on boot and every 6 hours.
 */
async function autoSendPass(): Promise<void> {
  const month = lastFullMonth();
  for (const u of users.listAll()) {
    try {
      const prefs = emailPrefs.get(u.id);
      if (prefs.monthlyEmail !== 1 || prefs.lastSentMonth === month) continue;
      if (!centralLink.get(u.id)) continue;
      const ent = resolveEntitlements(effectiveTier(u.id));
      if (!ent.features.includes("monthlyEmail")) continue;
      const result = await buildAndSendDigest(u.id, month);
      if (!result.ok && result.status !== 429) {
        console.warn(`monthly digest for ${u.email} not sent: ${result.error}`);
      }
    } catch (err) {
      console.warn(`monthly digest pass failed for ${u.email}:`, err);
    }
  }
}

export function startDigestScheduler(): void {
  // Let the app finish booting (and the entitlement sync land) first.
  setTimeout(() => void autoSendPass(), 45_000);
  setInterval(() => void autoSendPass(), 6 * 60 * 60 * 1000);
}
