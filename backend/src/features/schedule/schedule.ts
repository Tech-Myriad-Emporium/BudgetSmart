import { accounts, scheduledCharges, transactions } from "../../db/repo.js";
import type { ScheduledChargeRow } from "../../db/rows.js";

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Next occurrence after `dateIso` for a charge's schedule. */
export function advanceDate(dateIso: string, charge: Pick<ScheduledChargeRow, "type" | "cadence" | "intervalDays">): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  if (charge.type === "custom") {
    d.setUTCDate(d.getUTCDate() + Math.max(1, charge.intervalDays ?? 30));
  } else {
    switch (charge.cadence) {
      case "weekly": d.setUTCDate(d.getUTCDate() + 7); break;
      case "biweekly": d.setUTCDate(d.getUTCDate() + 14); break;
      case "yearly": d.setUTCFullYear(d.getUTCFullYear() + 1); break;
      default: d.setUTCMonth(d.getUTCMonth() + 1); break; // monthly
    }
  }
  return d.toISOString().slice(0, 10);
}

/** Post one due occurrence as a real transaction (when auto-post is on). */
function postOccurrence(charge: ScheduledChargeRow, date: string): void {
  const accountId = charge.accountId ?? accounts.listByUser(charge.userId, { activeOnly: true })[0]?.id;
  if (!accountId) return; // no account to post into — leave it visible on the calendar
  transactions.create({
    userId: charge.userId,
    accountId,
    transferAccountId: null,
    categoryId: charge.categoryId,
    type: charge.direction === "income" ? "income" : "expense",
    amount: charge.amount,
    merchant: charge.name,
    note: "Scheduled charge",
    date,
    pending: false,
    excluded: false,
    tags: "scheduled",
  });
}

/**
 * Due pass: walk every active charge whose date has arrived. Auto-post ones
 * become real transactions (catching up missed days); all advance to their
 * next occurrence, and finished ones (once / past endDate) deactivate.
 */
export function processDueCharges(): void {
  const today = todayIso();
  for (const charge of scheduledCharges.listAllActive()) {
    try {
      let date = charge.nextDate;
      let guard = 0;
      let active = 1;
      while (date <= today && guard++ < 36) {
        if (charge.endDate && date > charge.endDate) { active = 0; break; }
        if (charge.autoPost === 1) postOccurrence(charge, date);
        if (charge.type === "once") { active = 0; break; }
        date = advanceDate(date, charge);
      }
      if (charge.endDate && date > charge.endDate) active = 0;
      if (date !== charge.nextDate || active !== charge.active) {
        scheduledCharges.update(charge.id, { nextDate: date, active });
      }
    } catch (err) {
      console.warn(`scheduled charge ${charge.id} failed to process:`, err);
    }
  }
}

/** Runs shortly after boot, then hourly (dates only change at midnight, but
 *  the app may have been closed for days — this catches everything up). */
export function startScheduleWorker(): void {
  setTimeout(() => processDueCharges(), 10_000);
  setInterval(() => processDueCharges(), 60 * 60 * 1000);
}
