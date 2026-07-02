// "Pulse": the smart layer users feel — a 0–100 financial health score,
// plain-English explanations of why spending changed, smart alerts (goal
// pace, budget pace, debt-free date), and the 30-second daily money ritual.
import { sumCents, type Cents } from "../money.js";
import type { Budget, Category, GoalsSummary, PayoffPlan, Transaction } from "../types.js";

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

export interface HealthComponent {
  key: "savings" | "debt" | "stability" | "momentum";
  label: string;
  /** 0–25 points. */
  points: number;
  detail: string;
}

export interface HealthScore {
  /** 0–100. */
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  components: HealthComponent[];
}

export interface SpendingExplanation {
  categoryName: string;
  icon: string;
  color: string;
  deltaPct: number;
  current: Cents;
  previous: Cents;
  /** e.g. "Groceries rose 18% — 3 extra trips at a similar ticket size." */
  text: string;
}

export interface PulseAlert {
  kind: "goal" | "budget" | "debt" | "cash";
  icon: string;
  title: string;
  body: string;
  positive: boolean;
}

export interface DailyRitual {
  spentToday: Cents;
  /** Suggested daily guide (budget-remaining ÷ days left, else typical daily). */
  dailyGuide: Cents;
  /** Consecutive days (through yesterday) at or under the guide. */
  underStreakDays: number;
  microGoal: string;
}

export interface PulseSummary {
  health: HealthScore;
  explanations: SpendingExplanation[];
  alerts: PulseAlert[];
  ritual: DailyRitual;
}

export interface PulseInput {
  transactions: Transaction[];
  categories: Category[];
  /** Budgets for the current month. */
  budgets: Budget[];
  goals?: GoalsSummary | null;
  payoff?: PayoffPlan | null;
  now?: Date;
}

export function buildPulse(input: PulseInput): PulseSummary {
  const { transactions, categories, budgets } = input;
  const now = input.now ?? new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const todayIso = new Date(today).toISOString().slice(0, 10);
  const thisMonth = todayIso.slice(0, 7);
  const active = transactions.filter((t) => !t.excluded);
  const catById = new Map(categories.map((c) => [c.id, c]));

  const monthKey = (offset: number) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toISOString().slice(0, 7);

  /* ---------------- health score ---------------- */
  // last 3 full months of income/expense
  const months = [monthKey(-3), monthKey(-2), monthKey(-1)];
  const monthlyIncome: number[] = [];
  const monthlyExpense: number[] = [];
  for (const m of months) {
    monthlyIncome.push(sumCents(active.filter((t) => t.type === "income" && t.date.startsWith(m)).map((t) => t.amount)));
    monthlyExpense.push(sumCents(active.filter((t) => t.type === "expense" && t.date.startsWith(m)).map((t) => t.amount)));
  }
  const incomeSum = monthlyIncome.reduce((a, b) => a + b, 0);
  const expenseSum = monthlyExpense.reduce((a, b) => a + b, 0);

  const components: HealthComponent[] = [];

  // 1) savings rate → 25 pts at 20%+
  const savingsRate = incomeSum > 0 ? (incomeSum - expenseSum) / incomeSum : null;
  const savingsPts = savingsRate === null ? 12 : Math.max(0, Math.min(25, Math.round((savingsRate / 0.2) * 25)));
  components.push({
    key: "savings",
    label: "Savings rate",
    points: savingsPts,
    detail: savingsRate === null ? "Add income to measure this" : `You keep ${Math.round(savingsRate * 100)}% of income (20%+ scores full marks)`,
  });

  // 2) debt load → debt balance vs 6 months of income; 0 debt = 25
  const debtBalance = input.payoff ? input.payoff.totalPrincipal : 0;
  const halfYearIncome = incomeSum * 2; // 3 months × 2
  const debtPts =
    debtBalance <= 0 ? 25 : halfYearIncome > 0 ? Math.max(0, Math.min(25, Math.round(25 * (1 - debtBalance / halfYearIncome)))) : 10;
  components.push({
    key: "debt",
    label: "Debt load",
    points: debtPts,
    detail: debtBalance <= 0 ? "No tracked debt — full marks" : "Debt compared to half a year of income",
  });

  // 3) spending stability → variation between months
  const meanExp = monthlyExpense.length ? expenseSum / monthlyExpense.length : 0;
  const maxDev = meanExp > 0 ? Math.max(...monthlyExpense.map((e) => Math.abs(e - meanExp))) / meanExp : 1;
  const stabilityPts = meanExp <= 0 ? 12 : Math.max(0, Math.min(25, Math.round(25 * (1 - Math.min(1, maxDev)))));
  components.push({
    key: "stability",
    label: "Spending stability",
    points: stabilityPts,
    detail: meanExp <= 0 ? "Add a few months of spending to measure this" : `Monthly spending varies ~${Math.round(maxDev * 100)}% from your average`,
  });

  // 4) momentum → is monthly net positive and trending up?
  const nets = months.map((_, i) => monthlyIncome[i]! - monthlyExpense[i]!);
  const lastNet = nets[nets.length - 1] ?? 0;
  const momentumPts = Math.max(0, Math.min(25, Math.round(12 + (lastNet > 0 ? 8 : -8) + (nets.length >= 2 && lastNet >= (nets[nets.length - 2] ?? 0) ? 5 : -3))));
  components.push({
    key: "momentum",
    label: "Momentum",
    points: momentumPts,
    detail: lastNet > 0 ? "Last month ended in the green" : "Last month ended in the red",
  });

  const score = components.reduce((s, c) => s + c.points, 0);
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";

  /* ---------------- spending explanations ---------------- */
  const prevMonth = monthKey(-1);
  const prevPrevMonth = monthKey(-2);
  interface Agg { total: number; count: number }
  const agg = (m: string): Map<string, Agg> => {
    const out = new Map<string, Agg>();
    for (const t of active) {
      if (t.type !== "expense" || !t.categoryId || !t.date.startsWith(m)) continue;
      const a = out.get(t.categoryId) ?? out.set(t.categoryId, { total: 0, count: 0 }).get(t.categoryId)!;
      a.total += t.amount;
      a.count++;
    }
    return out;
  };
  const cur = agg(prevMonth); // compare the last FULL month to the one before it
  const prev = agg(prevPrevMonth);
  const explanations: SpendingExplanation[] = [];
  for (const [catId, c] of cur) {
    const p = prev.get(catId);
    if (!p || p.total <= 0) continue;
    const deltaPct = (c.total - p.total) / p.total;
    if (Math.abs(deltaPct) < 0.15 || Math.abs(c.total - p.total) < 2500) continue;
    const cat = catById.get(catId);
    if (!cat) continue;
    const tripDelta = c.count - p.count;
    const avgCur = c.total / Math.max(1, c.count);
    const avgPrev = p.total / Math.max(1, p.count);
    const ticketPct = avgPrev > 0 ? (avgCur - avgPrev) / avgPrev : 0;
    const dir = deltaPct > 0 ? "rose" : "fell";
    let why: string;
    if (Math.abs(tripDelta) >= 2 && Math.abs(ticketPct) < 0.1) {
      why = `${Math.abs(tripDelta)} ${tripDelta > 0 ? "extra" : "fewer"} purchases at a similar ticket size`;
    } else if (Math.abs(ticketPct) >= 0.1 && Math.abs(tripDelta) < 2) {
      why = `the average purchase ${ticketPct > 0 ? "grew" : "shrank"} ${Math.abs(Math.round(ticketPct * 100))}%`;
    } else if (Math.abs(tripDelta) >= 2) {
      why = `${Math.abs(tripDelta)} ${tripDelta > 0 ? "more" : "fewer"} purchases and a ${Math.abs(Math.round(ticketPct * 100))}% ${ticketPct > 0 ? "larger" : "smaller"} average ticket`;
    } else {
      why = `a handful of ${deltaPct > 0 ? "larger" : "smaller"} purchases`;
    }
    explanations.push({
      categoryName: cat.name,
      icon: cat.icon,
      color: cat.color,
      deltaPct: Math.round(deltaPct * 100) / 100,
      current: c.total,
      previous: p.total,
      text: `${cat.name} ${dir} ${Math.abs(Math.round(deltaPct * 100))}% — ${why}.`,
    });
  }
  explanations.sort((a, b) => Math.abs(b.current - b.previous) - Math.abs(a.current - a.previous));

  /* ---------------- smart alerts ---------------- */
  const alerts: PulseAlert[] = [];
  for (const g of input.goals?.goals ?? []) {
    const c = g.computed;
    if (c.complete || c.monthsRemaining === null || c.projectedMonths === null) continue;
    const diff = c.monthsRemaining - c.projectedMonths;
    if (diff >= 1) {
      alerts.push({
        kind: "goal", icon: "🎯", positive: true,
        title: `${g.name}: ${diff} month${diff === 1 ? "" : "s"} ahead of schedule`,
        body: `At the current pace you'll finish around ${c.projectedDate ?? "early"} — before your target.`,
      });
    } else if (diff <= -1) {
      alerts.push({
        kind: "goal", icon: "🎯", positive: false,
        title: `${g.name}: ${Math.abs(diff)} month${diff === -1 ? "" : "s"} behind`,
        body: c.requiredMonthly !== null ? `Bumping contributions to ${(c.requiredMonthly / 100).toFixed(0)}/mo gets you back on target.` : "Raise the monthly contribution to get back on target.",
      });
    }
  }
  if (input.payoff?.debtFreeDate) {
    const p = input.payoff;
    alerts.push({
      kind: "debt", icon: "⛓️‍💥", positive: true,
      title: `Debt-free by ${p.debtFreeDate!.slice(0, 7)}`,
      body: p.interestSaved > 0
        ? `Your extra payments save ${(p.interestSaved / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} in interest vs minimums.`
        : "Add an extra monthly payment to pull this date closer.",
    });
  }
  // budget pace for the current month
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  for (const b of budgets) {
    if (b.limit <= 0) continue;
    const cat = catById.get(b.categoryId);
    if (!cat) continue;
    const spent = sumCents(active.filter((t) => t.type === "expense" && t.categoryId === b.categoryId && t.date.startsWith(thisMonth)).map((t) => t.amount));
    const projected = dayOfMonth > 0 ? Math.round((spent / dayOfMonth) * daysInMonth) : spent;
    if (spent > b.limit) {
      alerts.push({ kind: "budget", icon: "⚠️", positive: false, title: `${cat.name} is over budget`, body: `Spent ${(spent / 100).toFixed(0)} of ${(b.limit / 100).toFixed(0)} with ${daysInMonth - dayOfMonth} days left.` });
    } else if (dayOfMonth >= 7 && projected > b.limit * 1.1) {
      alerts.push({ kind: "budget", icon: "⏱️", positive: false, title: `${cat.name} is pacing over`, body: `On track to hit ${(projected / 100).toFixed(0)} against a ${(b.limit / 100).toFixed(0)} budget.` });
    }
  }
  alerts.sort((a, b) => Number(a.positive) - Number(b.positive));

  /* ---------------- daily ritual ---------------- */
  const spentToday = sumCents(active.filter((t) => t.type === "expense" && t.date === todayIso).map((t) => t.amount));
  const totalLimit = sumCents(budgets.map((b) => b.limit));
  const spentThisMonth = sumCents(active.filter((t) => t.type === "expense" && t.date.startsWith(thisMonth)).map((t) => t.amount));
  const daysLeft = Math.max(1, daysInMonth - dayOfMonth + 1);
  // typical daily spend over the last 60 days (quiet days count as zero)
  const daily = new Map<string, number>();
  for (const t of active) {
    if (t.type !== "expense") continue;
    const ms = parseIso(t.date);
    if (ms < today - 60 * DAY || ms >= today) continue;
    daily.set(t.date, (daily.get(t.date) ?? 0) + t.amount);
  }
  const typicalDaily = Math.round(sumCents([...daily.values()] as Cents[]) / 60);
  const dailyGuide = totalLimit > 0 ? Math.max(0, Math.floor((totalLimit - spentThisMonth + spentToday) / daysLeft)) : typicalDaily;

  let underStreakDays = 0;
  const threshold = Math.max(dailyGuide, typicalDaily);
  for (let i = 1; i <= 60; i++) {
    const iso = new Date(today - i * DAY).toISOString().slice(0, 10);
    if ((daily.get(iso) ?? 0) <= threshold) underStreakDays++;
    else break;
  }

  let microGoal = "Log today's spending — 30 seconds keeps the picture honest.";
  const nearMilestone = (input.goals?.goals ?? [])
    .filter((g) => !g.computed.complete && g.computed.nextMilestone !== null)
    .map((g) => ({ g, need: Math.max(0, Math.round(g.targetAmount * g.computed.nextMilestone!) - g.currentAmount) }))
    .filter((x) => x.need > 0)
    .sort((a, b) => a.need - b.need)[0];
  if (nearMilestone) {
    microGoal = `${(nearMilestone.need / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} more puts ${nearMilestone.g.name} at ${Math.round(nearMilestone.g.computed.nextMilestone! * 100)}%.`;
  } else if (explanations[0] && explanations[0].deltaPct > 0) {
    microGoal = `Try a no-spend day on ${explanations[0].categoryName} — it drove last month's increase.`;
  }

  return {
    health: { score, grade, components },
    explanations: explanations.slice(0, 5),
    alerts: alerts.slice(0, 6),
    ritual: { spentToday, dailyGuide, underStreakDays, microGoal },
  };
}
