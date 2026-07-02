// T1 "smart cleanup" intelligence: duplicate detection, refund/transfer
// correction, AI auto-tagging, auto-budget suggestions and overspending
// alerts — all pure functions over the user's local data.
import type { Cents } from "../money.js";
import { normalizeMerchant } from "../recurring/engine.js";
import type { Budget, Category, Transaction } from "../types.js";

const DAY = 86_400_000;
const parseIso = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};

export interface DuplicatePair {
  a: Transaction;
  b: Transaction;
  daysApart: number;
}

export interface RefundMatch {
  expense: Transaction;
  refund: Transaction;
  daysApart: number;
}

export interface TransferCandidate {
  out: Transaction;
  in: Transaction;
  daysApart: number;
}

export interface AutoTagSuggestion {
  transactionId: string;
  merchant: string;
  date: string;
  amount: Cents;
  categoryId: string;
  categoryName: string;
  icon: string;
  color: string;
  source: "history" | "keyword";
  confidence: number;
}

export interface BudgetSuggestion {
  categoryId: string;
  categoryName: string;
  icon: string;
  color: string;
  /** Suggested monthly limit (median of recent full months, rounded up to $5). */
  suggested: Cents;
  /** The recent monthly totals the suggestion is based on. */
  basis: Cents[];
  currentLimit: Cents | null;
}

export interface OverspendAlert {
  categoryId: string;
  categoryName: string;
  icon: string;
  color: string;
  limit: Cents;
  spent: Cents;
  /** Straight-line projection of this month's final spend. */
  projected: Cents;
  severity: "over" | "pace";
}

export interface InsightsSummary {
  duplicates: DuplicatePair[];
  refunds: RefundMatch[];
  transfers: TransferCandidate[];
  autoTags: AutoTagSuggestion[];
  budgetSuggestions: BudgetSuggestion[];
  overspend: OverspendAlert[];
  /** Total actionable cleanup items. */
  cleanupCount: number;
}

/** Built-in keyword → category-name rules used when history can't decide. */
const KEYWORD_RULES: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /walmart|kroger|aldi|costco|safeway|publix|trader joe|whole foods|grocery|market/i, category: "Groceries" },
  { pattern: /mcdonald|starbucks|chipotle|burger|pizza|taco|cafe|restaurant|doordash|ubereats|uber eats|grubhub|dunkin|wendy|kfc|subway/i, category: "Dining" },
  { pattern: /\buber\b|\blyft\b|shell|chevron|exxon|bp\b|gas station|fuel|parking|transit|metro/i, category: "Transport" },
  { pattern: /netflix|spotify|hulu|disney\+|youtube|prime video|apple music|paramount|hbo|max\b|crunchyroll/i, category: "Subscriptions" },
  { pattern: /electric|water|sewer|comcast|xfinity|verizon|at&t|t-mobile|internet|utility|utilities|power co/i, category: "Utilities" },
  { pattern: /rent|mortgage|landlord|apartment/i, category: "Housing" },
  { pattern: /cinema|theater|steam|playstation|xbox|nintendo|concert|ticketmaster/i, category: "Entertainment" },
  { pattern: /pharmacy|cvs|walgreens|clinic|dental|doctor|hospital|urgent care/i, category: "Health" },
  { pattern: /amazon|target|ebay|etsy|best buy|ikea/i, category: "Shopping" },
  { pattern: /airline|delta|united|southwest|airbnb|hotel|hertz|expedia/i, category: "Travel" },
];

export interface InsightsInput {
  transactions: Transaction[];
  categories: Category[];
  /** Budgets for the current month (used for overspend alerts). */
  budgets: Budget[];
  now?: Date;
}

export function buildInsights(input: InsightsInput): InsightsSummary {
  const { transactions, categories, budgets } = input;
  const now = input.now ?? new Date();
  const catById = new Map(categories.map((c) => [c.id, c]));
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const active = transactions.filter((t) => !t.excluded);

  /* ---- duplicates: same merchant + amount within a day ---- */
  const duplicates: DuplicatePair[] = [];
  const dupSeen = new Set<string>();
  const byMerchantAmount = new Map<string, Transaction[]>();
  for (const t of active) {
    if (t.type === "transfer" || !t.merchant.trim()) continue;
    const key = `${t.type}|${normalizeMerchant(t.merchant)}|${t.amount}`;
    (byMerchantAmount.get(key) ?? byMerchantAmount.set(key, []).get(key)!).push(t);
  }
  for (const txns of byMerchantAmount.values()) {
    if (txns.length < 2) continue;
    const sorted = [...txns].sort((a, b) => (a.date < b.date ? -1 : 1));
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1]!;
      const b = sorted[i]!;
      const gap = (parseIso(b.date) - parseIso(a.date)) / DAY;
      if (gap <= 1 && !dupSeen.has(a.id) && !dupSeen.has(b.id)) {
        duplicates.push({ a, b, daysApart: gap });
        dupSeen.add(a.id);
        dupSeen.add(b.id);
      }
    }
  }

  /* ---- refunds: income matching a recent expense from the same payee ---- */
  const refunds: RefundMatch[] = [];
  const refundUsed = new Set<string>();
  const expenses = active.filter((t) => t.type === "expense");
  const incomes = active.filter((t) => t.type === "income");
  for (const inc of incomes) {
    if (refundUsed.has(inc.id)) continue;
    const incKey = normalizeMerchant(inc.merchant);
    if (!incKey) continue;
    const match = expenses.find((ex) => {
      if (refundUsed.has(ex.id) || ex.amount !== inc.amount) return false;
      if (normalizeMerchant(ex.merchant) !== incKey) return false;
      const gap = (parseIso(inc.date) - parseIso(ex.date)) / DAY;
      return gap >= 0 && gap <= 60;
    });
    if (match) {
      refunds.push({ expense: match, refund: inc, daysApart: (parseIso(inc.date) - parseIso(match.date)) / DAY });
      refundUsed.add(inc.id);
      refundUsed.add(match.id);
    }
  }

  /* ---- transfer candidates: equal +/- amounts across accounts ---- */
  const transfers: TransferCandidate[] = [];
  const trUsed = new Set<string>();
  for (const out of expenses) {
    if (trUsed.has(out.id) || refundUsed.has(out.id)) continue;
    const match = incomes.find((inc) => {
      if (trUsed.has(inc.id) || refundUsed.has(inc.id)) return false;
      if (inc.amount !== out.amount || inc.accountId === out.accountId) return false;
      return Math.abs(parseIso(inc.date) - parseIso(out.date)) / DAY <= 3;
    });
    if (match) {
      transfers.push({ out, in: match, daysApart: Math.abs(parseIso(match.date) - parseIso(out.date)) / DAY });
      trUsed.add(out.id);
      trUsed.add(match.id);
    }
  }

  /* ---- auto-tagging: learn merchant→category from history, else keywords ---- */
  const learned = new Map<string, Map<string, number>>();
  for (const t of active) {
    if (!t.categoryId || t.type !== "expense") continue;
    const key = normalizeMerchant(t.merchant);
    if (!key) continue;
    const counts = learned.get(key) ?? learned.set(key, new Map()).get(key)!;
    counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
  }
  const autoTags: AutoTagSuggestion[] = [];
  for (const t of active) {
    if (t.categoryId || t.type !== "expense" || !t.merchant.trim()) continue;
    const key = normalizeMerchant(t.merchant);
    let categoryId: string | null = null;
    let source: "history" | "keyword" = "history";
    let confidence = 0;
    const counts = key ? learned.get(key) : undefined;
    if (counts) {
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      if (best[1] >= 2 || total === best[1]) {
        categoryId = best[0];
        confidence = Math.min(0.95, 0.6 + best[1] * 0.1);
      }
    }
    if (!categoryId) {
      const rule = KEYWORD_RULES.find((r) => r.pattern.test(t.merchant));
      const cat = rule ? catByName.get(rule.category.toLowerCase()) : undefined;
      if (cat) {
        categoryId = cat.id;
        source = "keyword";
        confidence = 0.7;
      }
    }
    if (!categoryId) continue;
    const cat = catById.get(categoryId);
    if (!cat) continue;
    autoTags.push({
      transactionId: t.id,
      merchant: t.merchant,
      date: t.date,
      amount: t.amount,
      categoryId,
      categoryName: cat.name,
      icon: cat.icon,
      color: cat.color,
      source,
      confidence,
    });
  }
  autoTags.sort((a, b) => (a.date < b.date ? 1 : -1));

  /* ---- auto-budget: median of the last 3 full months per category ---- */
  const monthOf = (iso: string) => iso.slice(0, 7);
  const thisMonth = now.toISOString().slice(0, 7);
  const recentMonths: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    recentMonths.push(d.toISOString().slice(0, 7));
  }
  const spendByCatMonth = new Map<string, Map<string, number>>();
  for (const t of active) {
    if (t.type !== "expense" || !t.categoryId) continue;
    const m = monthOf(t.date);
    if (!recentMonths.includes(m)) continue;
    const byMonth = spendByCatMonth.get(t.categoryId) ?? spendByCatMonth.set(t.categoryId, new Map()).get(t.categoryId)!;
    byMonth.set(m, (byMonth.get(m) ?? 0) + t.amount);
  }
  const budgetByCat = new Map(budgets.map((b) => [b.categoryId, b.limit]));
  const budgetSuggestions: BudgetSuggestion[] = [];
  for (const [catId, byMonth] of spendByCatMonth) {
    if (byMonth.size < 2) continue; // needs a real pattern
    const cat = catById.get(catId);
    if (!cat || cat.kind !== "expense") continue;
    const totals = recentMonths.map((m) => byMonth.get(m) ?? 0).filter((v) => v > 0);
    const sorted = [...totals].sort((a, b) => a - b);
    const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2]! : Math.round((sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2);
    const suggested = Math.ceil(median / 500) * 500; // round up to $5
    if (suggested <= 0) continue;
    budgetSuggestions.push({
      categoryId: catId,
      categoryName: cat.name,
      icon: cat.icon,
      color: cat.color,
      suggested,
      basis: totals,
      currentLimit: budgetByCat.get(catId) ?? null,
    });
  }
  budgetSuggestions.sort((a, b) => b.suggested - a.suggested);

  /* ---- overspending alerts for the current month ---- */
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const spentThisMonth = new Map<string, number>();
  for (const t of active) {
    if (t.type !== "expense" || !t.categoryId || monthOf(t.date) !== thisMonth) continue;
    spentThisMonth.set(t.categoryId, (spentThisMonth.get(t.categoryId) ?? 0) + t.amount);
  }
  const overspend: OverspendAlert[] = [];
  for (const b of budgets) {
    if (b.limit <= 0) continue;
    const cat = catById.get(b.categoryId);
    if (!cat) continue;
    const spent = spentThisMonth.get(b.categoryId) ?? 0;
    const projected = dayOfMonth > 0 ? Math.round((spent / dayOfMonth) * daysInMonth) : spent;
    if (spent > b.limit) {
      overspend.push({ categoryId: b.categoryId, categoryName: cat.name, icon: cat.icon, color: cat.color, limit: b.limit, spent, projected, severity: "over" });
    } else if (dayOfMonth >= 7 && projected > b.limit * 1.05) {
      overspend.push({ categoryId: b.categoryId, categoryName: cat.name, icon: cat.icon, color: cat.color, limit: b.limit, spent, projected, severity: "pace" });
    }
  }
  overspend.sort((a, b) => (a.severity === b.severity ? b.spent - a.spent : a.severity === "over" ? -1 : 1));

  return {
    duplicates,
    refunds,
    transfers,
    autoTags,
    budgetSuggestions,
    overspend,
    cleanupCount: duplicates.length + refunds.length + transfers.length + autoTags.length,
  };
}
