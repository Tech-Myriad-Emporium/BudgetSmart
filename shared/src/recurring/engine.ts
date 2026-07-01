import { sumCents, type Cents } from "../money.js";
import type {
  Cadence,
  Category,
  RecurringItem,
  RecurringSummary,
  Transaction,
  UpcomingCharge,
} from "../types.js";

const DAY = 86_400_000;

const parseIso = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};
const toIso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

function addMonthsIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1 + n, d));
  return date.toISOString().slice(0, 10);
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Collapse merchant strings that are the "same" payee. */
export function normalizeMerchant(merchant: string): string {
  return merchant
    .toLowerCase()
    .replace(/[#*].*$/, "") // drop trailing store/ref ids
    .replace(/\b\d{2,}\b/g, "") // drop long numbers
    .replace(/\s+/g, " ")
    .trim();
}

/** Map a median day-gap to a cadence, or null if it isn't regular enough. */
function cadenceFromGap(days: number): Cadence | null {
  if (days >= 5 && days <= 9) return "weekly";
  if (days >= 11 && days <= 18) return "biweekly";
  if (days >= 25 && days <= 38) return "monthly";
  if (days >= 350 && days <= 380) return "yearly";
  return null;
}

const cadenceToMonthly = (cadence: Cadence, amount: Cents): Cents => {
  switch (cadence) {
    case "weekly":
      return Math.round((amount * 52) / 12);
    case "biweekly":
      return Math.round((amount * 26) / 12);
    case "monthly":
      return amount;
    case "yearly":
      return Math.round(amount / 12);
  }
};

function predictNext(lastIso: string, cadence: Cadence): string {
  switch (cadence) {
    case "weekly":
      return toIso(parseIso(lastIso) + 7 * DAY);
    case "biweekly":
      return toIso(parseIso(lastIso) + 14 * DAY);
    case "monthly":
      return addMonthsIso(lastIso, 1);
    case "yearly":
      return addMonthsIso(lastIso, 12);
  }
}

export interface DetectRecurringInput {
  transactions: Transaction[];
  categories: Category[];
  now?: Date;
  /** Look-ahead window for upcoming charges, in days. */
  upcomingDays?: number;
}

export function detectRecurring(input: DetectRecurringInput): RecurringSummary {
  const { transactions, categories } = input;
  const now = input.now ?? new Date();
  const upcomingDays = input.upcomingDays ?? 35;
  const byId = new Map(categories.map((c) => [c.id, c]));

  // group qualifying expenses by normalized merchant
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.type !== "expense" || t.excluded || !t.merchant.trim()) continue;
    const key = normalizeMerchant(t.merchant);
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }

  const items: RecurringItem[] = [];

  for (const [key, txns] of groups) {
    if (txns.length < 2) continue;
    const sorted = [...txns].sort((a, b) => (a.date < b.date ? -1 : 1));
    const dates = sorted.map((t) => parseIso(t.date));
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) gaps.push((dates[i]! - dates[i - 1]!) / DAY);

    const medianGap = median(gaps);
    const cadence = cadenceFromGap(medianGap);
    if (!cadence) continue;

    const amounts = sorted.map((t) => t.amount);
    const typicalAmount = Math.round(median(amounts));
    if (typicalAmount <= 0) continue;

    // regularity: how consistent are the gaps and amounts?
    const gapSpread = gaps.length ? Math.max(...gaps) - Math.min(...gaps) : 0;
    const gapRegular = medianGap > 0 ? Math.max(0, 1 - gapSpread / (medianGap * 1.5)) : 0;
    const amtMean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const amtSpread = amtMean > 0 ? (Math.max(...amounts) - Math.min(...amounts)) / amtMean : 1;
    const amtRegular = Math.max(0, 1 - amtSpread);

    const occBoost = Math.min((sorted.length - 1) * 0.18, 0.55);
    const confidence = Math.max(0, Math.min(1, 0.3 + occBoost + gapRegular * 0.2 + amtRegular * 0.2));
    if (confidence < 0.5 && sorted.length < 3) continue;

    const last = sorted[sorted.length - 1]!;
    const cat = last.categoryId ? byId.get(last.categoryId) : undefined;
    const isSubscription =
      (cat?.name ?? "").toLowerCase() === "subscriptions" ||
      sorted.some((t) => t.tags.includes("subscription")) ||
      (cadence !== "yearly" && amtRegular > 0.9 && typicalAmount <= 5000);

    items.push({
      key,
      merchant: last.merchant,
      categoryId: last.categoryId,
      categoryName: cat?.name ?? "Uncategorized",
      icon: cat?.icon ?? (isSubscription ? "♻" : "🔁"),
      color: cat?.color ?? "#00FF41",
      cadence,
      typicalAmount,
      monthlyCost: cadenceToMonthly(cadence, typicalAmount),
      occurrences: sorted.length,
      lastDate: last.date,
      nextDate: predictNext(last.date, cadence),
      confidence: Math.round(confidence * 100) / 100,
      isSubscription,
    });
  }

  items.sort((a, b) => b.monthlyCost - a.monthlyCost);

  // upcoming charges within the look-ahead window
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const horizon = today + upcomingDays * DAY;
  const upcoming: UpcomingCharge[] = items
    .map((it) => {
      // roll the predicted date forward until it's today-or-later
      let next = parseIso(it.nextDate);
      let guardIso = it.nextDate;
      while (next < today) {
        guardIso = predictNext(guardIso, it.cadence);
        next = parseIso(guardIso);
      }
      return { it, next, iso: guardIso };
    })
    .filter(({ next }) => next <= horizon)
    .map(({ it, next, iso }) => ({
      key: it.key,
      merchant: it.merchant,
      icon: it.icon,
      color: it.color,
      date: iso,
      amount: it.typicalAmount,
      daysAway: Math.round((next - today) / DAY),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const subscriptions = items.filter((i) => i.isSubscription);
  return {
    items,
    totalMonthly: sumCents(items.map((i) => i.monthlyCost)),
    totalAnnual: sumCents(items.map((i) => i.monthlyCost)) * 12,
    subscriptionCount: subscriptions.length,
    subscriptionMonthly: sumCents(subscriptions.map((i) => i.monthlyCost)),
    upcoming,
  };
}
