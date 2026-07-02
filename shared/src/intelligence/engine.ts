// T3 money intelligence: tax projection & planning, debt intelligence
// (BNPL / promo APR / refinancing), investment intelligence (fees, employer
// match, rebalancing), life-event modeling, opportunity cost, negotiation
// scripts and impulse guard. Estimates, not tax/financial advice.
import { sumCents, type Cents } from "../money.js";
import { detectRecurring, normalizeMerchant } from "../recurring/engine.js";
import type { Category, Debt, Holding, Transaction } from "../types.js";

const DAY = 86_400_000;
const parseIso = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/* ------------------------------------------------------------------ *
 * Tax intelligence (US federal, single filer, estimates only)
 * ------------------------------------------------------------------ */
/** 2025 federal brackets, single filer, thresholds in cents. */
const BRACKETS: Array<{ upTo: number; rate: number }> = [
  { upTo: 1_192_500_00, rate: 0.1 },
  { upTo: 4_847_500_00, rate: 0.12 },
  { upTo: 10_335_000_00, rate: 0.22 },
  { upTo: 19_730_000_00, rate: 0.24 },
  { upTo: 25_052_500_00, rate: 0.32 },
  { upTo: 62_635_000_00, rate: 0.35 },
  { upTo: Infinity, rate: 0.37 },
];
const STANDARD_DEDUCTION: Cents = 1_500_000; // $15,000

export function federalTax(taxableCents: Cents): { tax: Cents; marginalRate: number } {
  let tax = 0;
  let prev = 0;
  let marginalRate = BRACKETS[0]!.rate;
  for (const b of BRACKETS) {
    if (taxableCents <= prev) break;
    const inBracket = Math.min(taxableCents, b.upTo) - prev;
    tax += inBracket * b.rate;
    marginalRate = b.rate;
    prev = b.upTo;
  }
  return { tax: Math.round(tax), marginalRate };
}

export interface TaxIntel {
  year: number;
  ytdIncome: Cents;
  annualizedIncome: Cents;
  standardDeduction: Cents;
  taxableIncome: Cents;
  estimatedTax: Cents;
  effectiveRate: number;
  marginalRate: number;
  monthlySetAside: Cents;
  /** Quarterly estimated-payment schedule. */
  quarterly: Array<{ due: string; amount: Cents; passed: boolean }>;
  /** Withholding check from tax-tagged transactions. */
  withheldYtd: Cents;
  withholdingStatus: "on-track" | "under" | "over" | "unknown";
  /** Capital gains estimate from holdings. */
  gains: {
    unrealized: Cents;
    longTerm: Cents;
    shortTerm: Cents;
    estimatedTaxIfSold: Cents;
  };
  /** Potentially deductible spending by group. */
  deductions: Array<{ group: string; icon: string; total: Cents }>;
  deductionTotal: Cents;
  itemizeHint: boolean;
  /** Income anomalies (e.g. a paycheck that differs from your usual). */
  anomalies: Array<{ merchant: string; date: string; amount: Cents; typical: Cents }>;
}

const DEDUCTION_GROUPS: Array<{ group: string; icon: string; pattern: RegExp }> = [
  { group: "Charitable donations", icon: "💝", pattern: /donat|charit|church|tithe|red cross|goodwill|nonprofit/i },
  { group: "Medical & dental", icon: "🏥", pattern: /medical|doctor|dental|hospital|pharmacy|clinic|therapy|urgent care/i },
  { group: "Education", icon: "🎓", pattern: /tuition|university|college|course|student loan interest/i },
  { group: "Business expenses", icon: "💼", pattern: /business|office|software license|coworking|freelance/i },
];

/* ------------------------------------------------------------------ *
 * Debt intelligence
 * ------------------------------------------------------------------ */
export interface BnplPlan {
  merchant: string;
  installment: Cents;
  paid: number;
  estimatedTotal: number;
  nextDue: string;
  provider: boolean; // matched a known BNPL provider name
}

export interface RefinanceIdea {
  debtId: string;
  name: string;
  icon: string;
  balance: Cents;
  aprBps: number;
  /** Interest per year at the current APR. */
  interestNow: Cents;
  /** Interest per year at a plausible refinance APR. */
  interestAt: Cents;
  refiAprBps: number;
  annualSavings: Cents;
}

export interface PromoRisk {
  debtId: string;
  name: string;
  icon: string;
  balance: Cents;
  aprBps: number;
}

export interface DebtIntel {
  bnpl: BnplPlan[];
  refinance: RefinanceIdea[];
  promoRisks: PromoRisk[];
}

/* ------------------------------------------------------------------ *
 * Investment intelligence
 * ------------------------------------------------------------------ */
export interface FeeEstimate {
  holdingId: string;
  name: string;
  symbol: string;
  assetClass: string;
  value: Cents;
  estRatioBps: number;
  annualFee: Cents;
  /** Value lost to this fee over 20 years vs. fee-free compounding at 7%. */
  drag20y: Cents;
}

export interface RebalanceAlert {
  assetClass: string;
  label: string;
  currentShare: number;
  targetShare: number;
  driftPts: number;
  action: "trim" | "add";
}

export interface MatchCheck {
  salary: Cents;
  contribPct: number;
  matchPct: number;
  matchCapPct: number;
  /** Free money you're leaving on the table per year (0 when maxed). */
  missedMatch: Cents;
}

export interface InvestIntel {
  fees: FeeEstimate[];
  totalAnnualFees: Cents;
  rebalance: RebalanceAlert[];
  match: MatchCheck | null;
}

/* ------------------------------------------------------------------ *
 * Life intelligence + AI extras
 * ------------------------------------------------------------------ */
export interface LifeEventModel {
  key: string;
  icon: string;
  title: string;
  monthlyCost: Cents;
  note: string;
  /** New monthly net after the event, from the user's current average. */
  newMonthlyNet: Cents;
}

export interface OpportunityCostRow {
  years: number;
  futureValue: Cents;
}

export interface NegotiationScript {
  merchant: string;
  monthlyCost: Cents;
  script: string;
}

export interface ImpulsePurchase {
  transactionId: string;
  merchant: string;
  date: string;
  amount: Cents;
  categoryName: string;
}

export interface IntelligenceSummary {
  tax: TaxIntel;
  debt: DebtIntel;
  invest: InvestIntel;
  life: LifeEventModel[];
  /** FV of $100/mo invested, per horizon — the opportunity-cost table. */
  opportunity: OpportunityCostRow[];
  negotiation: NegotiationScript[];
  impulse: { purchases: ImpulsePurchase[]; total30d: Cents };
  /** Net-worth style long-range projection from current pace. */
  longRange: Array<{ years: number; projected: Cents }>;
  monthlyNet: Cents;
}

export interface IntelligenceInput {
  transactions: Transaction[];
  categories: Category[];
  debts: Debt[];
  holdings: Holding[];
  now?: Date;
  /** Optional 401(k) match check parameters. */
  match?: { salary: Cents; contribPct: number; matchPct: number; matchCapPct: number };
}

const BNPL_PROVIDERS = /klarna|afterpay|affirm|sezzle|zip\b|paypal pay in/i;
const FEE_RATIO_BPS: Record<string, number> = {
  etf: 10,
  stock: 0,
  crypto: 50,
  bond: 15,
  cash: 0,
  real_estate: 30,
  other: 30,
};
const TARGET_ALLOCATION: Record<string, number> = {
  stock: 0.4,
  etf: 0.3,
  bond: 0.2,
  cash: 0.05,
  crypto: 0.05,
};

export function opportunityCost(monthlyCents: Cents, aprPct = 7): OpportunityCostRow[] {
  const r = aprPct / 100 / 12;
  return [5, 10, 20, 30].map((years) => {
    const n = years * 12;
    const fv = monthlyCents * ((Math.pow(1 + r, n) - 1) / r);
    return { years, futureValue: Math.round(fv) };
  });
}

export function buildIntelligence(input: IntelligenceInput): IntelligenceSummary {
  const { transactions, categories, debts, holdings } = input;
  const now = input.now ?? new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const year = now.getUTCFullYear();
  const active = transactions.filter((t) => !t.excluded);
  const catById = new Map(categories.map((c) => [c.id, c]));

  /* ================= TAX ================= */
  const thisYear = (iso: string) => iso.startsWith(String(year));
  const incomeTxns = active.filter((t) => t.type === "income" && thisYear(t.date));
  const ytdIncome = sumCents(incomeTxns.map((t) => t.amount));
  const dayOfYear = Math.max(1, Math.round((today - Date.UTC(year, 0, 1)) / DAY) + 1);
  const annualizedIncome = Math.round((ytdIncome / dayOfYear) * 365);
  const taxableIncome = Math.max(0, annualizedIncome - STANDARD_DEDUCTION);
  const { tax: estimatedTax, marginalRate } = federalTax(taxableIncome);
  const effectiveRate = annualizedIncome > 0 ? estimatedTax / annualizedIncome : 0;

  const qDates = [`${year}-04-15`, `${year}-06-15`, `${year}-09-15`, `${year + 1}-01-15`];
  const quarterly = qDates.map((due) => ({
    due,
    amount: Math.round(estimatedTax / 4),
    passed: parseIso(due) < today,
  }));

  // withholding: transactions in a "tax"-ish category or tagged "tax"
  const withheldYtd = sumCents(
    active
      .filter((t) => {
        if (!thisYear(t.date) || t.type !== "expense") return false;
        const cat = t.categoryId ? catById.get(t.categoryId) : undefined;
        return t.tags.includes("tax") || /tax/i.test(cat?.name ?? "");
      })
      .map((t) => t.amount),
  );
  const expectedByNow = Math.round(estimatedTax * (dayOfYear / 365));
  let withholdingStatus: TaxIntel["withholdingStatus"] = "unknown";
  if (withheldYtd > 0 && estimatedTax > 0) {
    const ratio = withheldYtd / Math.max(1, expectedByNow);
    withholdingStatus = ratio < 0.85 ? "under" : ratio > 1.2 ? "over" : "on-track";
  }

  // capital gains from holdings
  let longTerm = 0;
  let shortTerm = 0;
  for (const h of holdings) {
    const gain = Math.round(h.quantity * h.currentPrice) - h.costBasis;
    const heldMs = today - parseIso(h.createdAt.slice(0, 10));
    if (heldMs >= 365 * DAY) longTerm += gain;
    else shortTerm += gain;
  }
  const estimatedTaxIfSold = Math.round(Math.max(0, longTerm) * 0.15 + Math.max(0, shortTerm) * marginalRate);

  // deduction finder
  const deductions = DEDUCTION_GROUPS.map((g) => ({
    group: g.group,
    icon: g.icon,
    total: sumCents(
      active
        .filter((t) => {
          if (t.type !== "expense" || !thisYear(t.date)) return false;
          const cat = t.categoryId ? catById.get(t.categoryId) : undefined;
          return g.pattern.test(t.merchant) || g.pattern.test(cat?.name ?? "") || t.tags.some((tag) => g.pattern.test(tag));
        })
        .map((t) => t.amount),
    ),
  })).filter((d) => d.total > 0);
  const deductionTotal = sumCents(deductions.map((d) => d.total));
  const annualizedDeductions = Math.round((deductionTotal / dayOfYear) * 365);

  // income anomalies: paychecks that deviate >15% from that payer's median
  const anomalies: TaxIntel["anomalies"] = [];
  const byPayer = new Map<string, Transaction[]>();
  for (const t of incomeTxns) {
    const key = normalizeMerchant(t.merchant);
    if (!key) continue;
    (byPayer.get(key) ?? byPayer.set(key, []).get(key)!).push(t);
  }
  for (const txns of byPayer.values()) {
    if (txns.length < 3) continue;
    const typical = Math.round(median(txns.map((t) => t.amount)));
    if (typical <= 0) continue;
    for (const t of txns) {
      if (Math.abs(t.amount - typical) / typical > 0.15) {
        anomalies.push({ merchant: t.merchant, date: t.date, amount: t.amount, typical });
      }
    }
  }
  anomalies.sort((a, b) => (a.date < b.date ? 1 : -1));

  const tax: TaxIntel = {
    year,
    ytdIncome,
    annualizedIncome,
    standardDeduction: STANDARD_DEDUCTION,
    taxableIncome,
    estimatedTax,
    effectiveRate: Math.round(effectiveRate * 1000) / 1000,
    marginalRate,
    monthlySetAside: Math.ceil(estimatedTax / 12),
    quarterly,
    withheldYtd,
    withholdingStatus,
    gains: { unrealized: longTerm + shortTerm, longTerm, shortTerm, estimatedTaxIfSold },
    deductions,
    deductionTotal,
    itemizeHint: annualizedDeductions > STANDARD_DEDUCTION,
    anomalies: anomalies.slice(0, 5),
  };

  /* ================= DEBT IQ ================= */
  // BNPL: 3–5 equal expenses ~2 weeks apart (or a known provider name)
  const bnpl: BnplPlan[] = [];
  const groups = new Map<string, Transaction[]>();
  for (const t of active) {
    if (t.type !== "expense" || !t.merchant.trim()) continue;
    const key = `${normalizeMerchant(t.merchant)}|${t.amount}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }
  for (const txns of groups.values()) {
    if (txns.length < 2 || txns.length > 6) continue;
    const sorted = [...txns].sort((a, b) => (a.date < b.date ? -1 : 1));
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) gaps.push((parseIso(sorted[i]!.date) - parseIso(sorted[i - 1]!.date)) / DAY);
    const gap = median(gaps);
    const provider = BNPL_PROVIDERS.test(sorted[0]!.merchant);
    const looksBiweekly = gap >= 12 && gap <= 16;
    if (!provider && !(looksBiweekly && sorted.length >= 3)) continue;
    if (!looksBiweekly && !(provider && gap >= 6 && gap <= 35)) continue;
    const last = sorted[sorted.length - 1]!;
    const nextMs = parseIso(last.date) + Math.round(gap) * DAY;
    if (nextMs < today - 30 * DAY) continue; // plan probably finished a while ago
    bnpl.push({
      merchant: last.merchant,
      installment: last.amount,
      paid: sorted.length,
      estimatedTotal: 4,
      nextDue: new Date(nextMs).toISOString().slice(0, 10),
      provider,
    });
  }

  const refinance: RefinanceIdea[] = debts
    .filter((d) => d.balance > 0 && d.aprBps >= 1500)
    .map((d) => {
      const refiAprBps = d.kind === "credit_card" ? 999 : Math.min(d.aprBps, 899);
      const interestNow = Math.round((d.balance * d.aprBps) / 10_000);
      const interestAt = Math.round((d.balance * refiAprBps) / 10_000);
      return {
        debtId: d.id,
        name: d.name,
        icon: d.icon,
        balance: d.balance,
        aprBps: d.aprBps,
        interestNow,
        interestAt,
        refiAprBps,
        annualSavings: interestNow - interestAt,
      };
    })
    .filter((r) => r.annualSavings > 1000)
    .sort((a, b) => b.annualSavings - a.annualSavings);

  const promoRisks: PromoRisk[] = debts
    .filter((d) => d.balance > 0 && d.aprBps < 500)
    .map((d) => ({ debtId: d.id, name: d.name, icon: d.icon, balance: d.balance, aprBps: d.aprBps }));

  /* ================= INVEST IQ ================= */
  const totalValue = sumCents(holdings.map((h) => Math.round(h.quantity * h.currentPrice)));
  const fees: FeeEstimate[] = holdings
    .map((h) => {
      const value = Math.round(h.quantity * h.currentPrice);
      const estRatioBps = FEE_RATIO_BPS[h.assetClass] ?? 30;
      const annualFee = Math.round((value * estRatioBps) / 10_000);
      // rough 20-year drag: value*(1.07^20) - value*((1.07 - fee)^20)
      const g = Math.pow(1.07, 20);
      const gNet = Math.pow(1.07 - estRatioBps / 10_000, 20);
      const drag20y = Math.round(value * (g - gNet));
      return { holdingId: h.id, name: h.name, symbol: h.symbol, assetClass: h.assetClass, value, estRatioBps, annualFee, drag20y };
    })
    .filter((f) => f.annualFee > 0)
    .sort((a, b) => b.annualFee - a.annualFee);

  const shares = new Map<string, number>();
  for (const h of holdings) {
    const value = Math.round(h.quantity * h.currentPrice);
    shares.set(h.assetClass, (shares.get(h.assetClass) ?? 0) + value);
  }
  const rebalance: RebalanceAlert[] = [];
  if (totalValue > 0) {
    for (const [cls, target] of Object.entries(TARGET_ALLOCATION)) {
      const current = (shares.get(cls) ?? 0) / totalValue;
      const driftPts = Math.round((current - target) * 100);
      if (Math.abs(driftPts) >= 10) {
        rebalance.push({
          assetClass: cls,
          label: cls,
          currentShare: Math.round(current * 100) / 100,
          targetShare: target,
          driftPts,
          action: driftPts > 0 ? "trim" : "add",
        });
      }
    }
  }

  let match: MatchCheck | null = null;
  if (input.match && input.match.salary > 0) {
    const { salary, contribPct, matchPct, matchCapPct } = input.match;
    const matchedPct = Math.min(contribPct, matchCapPct);
    const missedPct = Math.max(0, matchCapPct - contribPct);
    const missedMatch = Math.round(salary * (missedPct / 100) * (matchPct / 100));
    match = { salary, contribPct, matchPct, matchCapPct, missedMatch: matchedPct >= matchCapPct ? 0 : missedMatch };
  }

  /* ================= LIFE + AI ================= */
  // average monthly net over the last 3 full months
  const monthStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const threeAgo = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1);
  let inc3 = 0;
  let exp3 = 0;
  for (const t of active) {
    const ms = parseIso(t.date);
    if (ms < threeAgo || ms >= monthStartMs) continue;
    if (t.type === "income") inc3 += t.amount;
    else if (t.type === "expense") exp3 += t.amount;
  }
  const monthlyNet = Math.round((inc3 - exp3) / 3);

  const LIFE_PRESETS: Array<{ key: string; icon: string; title: string; monthlyCost: Cents; note: string }> = [
    { key: "baby", icon: "👶", title: "New baby", monthlyCost: 120_000, note: "Diapers, childcare, healthcare — first-year average." },
    { key: "car", icon: "🚗", title: "Car payment ($30k, 60mo @ 7%)", monthlyCost: 59_400, note: "Plus insurance and fuel on top." },
    { key: "mortgage", icon: "🏠", title: "Mortgage step-up (+$300k @ 6.5%)", monthlyCost: 189_600, note: "Principal & interest only — taxes and insurance extra." },
    { key: "job", icon: "💼", title: "Job change (-10% pay)", monthlyCost: Math.max(0, Math.round((inc3 / 3) * 0.1)), note: "Impact of a 10% pay cut from your current average income." },
  ];
  const life: LifeEventModel[] = LIFE_PRESETS.map((p) => ({
    ...p,
    newMonthlyNet: monthlyNet - p.monthlyCost,
  }));

  // negotiation scripts for the top recurring bills
  const recurring = detectRecurring({ transactions, categories, now });
  const negotiation: NegotiationScript[] = recurring.items
    .filter((i) => i.cadence === "monthly" && i.monthlyCost >= 2_000)
    .slice(0, 3)
    .map((i) => ({
      merchant: i.merchant,
      monthlyCost: i.monthlyCost,
      script:
        `Hi, I've been a ${i.merchant} customer and I'm reviewing my bills. ` +
        `I'm currently paying ${(i.typicalAmount / 100).toFixed(2)}/mo and competitors are quoting less. ` +
        `Before I cancel, is there a promotion, loyalty discount, or cheaper plan you can apply to my account? ` +
        `If not, please connect me with your retention team.`,
    }));

  // impulse guard: large non-essential purchases in the last 30 days
  const ESSENTIAL = /grocer|rent|mortgage|utilit|insurance|pharmac|medical|fuel|gas\b/i;
  const spends = active
    .filter((t) => t.type === "expense" && parseIso(t.date) >= today - 90 * DAY)
    .map((t) => t.amount);
  const typicalSpend = Math.round(median(spends));
  const threshold = Math.max(10_000, typicalSpend * 5);
  const purchases: ImpulsePurchase[] = active
    .filter((t) => {
      if (t.type !== "expense" || parseIso(t.date) < today - 30 * DAY) return false;
      const cat = t.categoryId ? catById.get(t.categoryId) : undefined;
      if (ESSENTIAL.test(cat?.name ?? "") || ESSENTIAL.test(t.merchant)) return false;
      return t.amount >= threshold;
    })
    .map((t) => ({
      transactionId: t.id,
      merchant: t.merchant,
      date: t.date,
      amount: t.amount,
      categoryName: (t.categoryId ? catById.get(t.categoryId)?.name : undefined) ?? "Uncategorized",
    }))
    .sort((a, b) => b.amount - a.amount);

  // long-range projection: invested net worth pace at 7%
  const portfolioValue = totalValue;
  const longRange = [1, 5, 10, 20].map((years) => {
    const r = 0.07 / 12;
    const n = years * 12;
    const fvExisting = portfolioValue * Math.pow(1 + r, n);
    const contrib = Math.max(0, monthlyNet);
    const fvContrib = contrib > 0 ? contrib * ((Math.pow(1 + r, n) - 1) / r) : 0;
    return { years, projected: Math.round(fvExisting + fvContrib) };
  });

  return {
    tax,
    debt: { bnpl, refinance, promoRisks },
    invest: { fees, totalAnnualFees: sumCents(fees.map((f) => f.annualFee)), rebalance, match },
    life,
    opportunity: opportunityCost(10_000),
    negotiation,
    impulse: { purchases, total30d: sumCents(purchases.map((p) => p.amount)) },
    longRange,
    monthlyNet,
  };
}
