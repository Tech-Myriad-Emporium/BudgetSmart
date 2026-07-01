import { sumCents, type Cents } from "../money.js";
import type {
  Debt,
  DebtsOverview,
  DebtStrategy,
  PayoffEntry,
  PayoffPlan,
  PayoffPoint,
} from "../types.js";
import { isoAfterMonths } from "../goals/engine.js";

/** Hard cap so pathological inputs (minimums below interest) can't loop forever. */
const HORIZON_MONTHS = 600;

export const aprBpsToMonthlyRate = (aprBps: number): number => aprBps / 10_000 / 12;

interface SimDebt {
  id: string;
  balance: Cents;
  aprBps: number;
  minimumPayment: Cents;
  interestPaid: Cents;
  payoffMonth: number | null;
}

/** Fixed payoff priority. Snowball: smallest balance first. Avalanche: highest APR first. */
function prioritize(debts: SimDebt[], strategy: DebtStrategy): SimDebt[] {
  const arr = [...debts];
  arr.sort((a, b) =>
    strategy === "snowball"
      ? a.balance - b.balance || b.aprBps - a.aprBps
      : b.aprBps - a.aprBps || a.balance - b.balance,
  );
  return arr;
}

interface SimResult {
  months: number;
  totalInterest: Cents;
  totalPaid: Cents;
  viable: boolean;
  order: SimDebt[];
  timeline: PayoffPoint[];
}

/**
 * Month-by-month payoff simulation. Each month: accrue interest, pay every
 * active debt its minimum, then pour all remaining budget onto debts in
 * priority order. Freed-up minimums from cleared debts roll forward (snowball),
 * because the monthly budget is held constant.
 */
function simulate(input: Debt[], strategy: DebtStrategy, extraPerMonth: Cents): SimResult {
  const debts: SimDebt[] = input.map((d) => ({
    id: d.id,
    balance: d.balance,
    aprBps: d.aprBps,
    minimumPayment: d.minimumPayment,
    interestPaid: 0,
    payoffMonth: null,
  }));
  const order = prioritize(debts, strategy);
  const monthlyBudget = sumCents(input.map((d) => d.minimumPayment)) + extraPerMonth;

  const totalBalance = () => sumCents(debts.map((d) => Math.max(0, d.balance)));
  const timeline: PayoffPoint[] = [{ monthIndex: 0, totalBalance: totalBalance() }];

  let month = 0;
  let totalInterest = 0;
  let totalPaid = 0;

  while (debts.some((d) => d.balance > 0) && month < HORIZON_MONTHS) {
    month++;

    // 1. accrue interest
    for (const d of order) {
      if (d.balance <= 0) continue;
      const interest = Math.round(d.balance * aprBpsToMonthlyRate(d.aprBps));
      d.balance += interest;
      d.interestPaid += interest;
      totalInterest += interest;
    }

    // 2. pay minimums on active debts
    let available = monthlyBudget;
    for (const d of order) {
      if (d.balance <= 0 || available <= 0) continue;
      const pay = Math.min(d.minimumPayment, d.balance, available);
      d.balance -= pay;
      available -= pay;
      totalPaid += pay;
    }

    // 3. pour the remainder (extra + freed minimums) onto debts in priority order
    for (const d of order) {
      if (available <= 0) break;
      if (d.balance <= 0) continue;
      const pay = Math.min(d.balance, available);
      d.balance -= pay;
      available -= pay;
      totalPaid += pay;
    }

    // 4. record payoffs
    for (const d of order) {
      if (d.payoffMonth === null && d.balance <= 0) d.payoffMonth = month;
    }
    timeline.push({ monthIndex: month, totalBalance: totalBalance() });
  }

  return {
    months: month,
    totalInterest,
    totalPaid,
    viable: debts.every((d) => d.balance <= 0),
    order,
    timeline,
  };
}

/** Compute a full payoff plan plus the savings vs. paying with no extra. */
export function computePayoffPlan(
  debts: Debt[],
  strategy: DebtStrategy,
  extraPerMonth: Cents,
  now: Date = new Date(),
): PayoffPlan {
  const plan = simulate(debts, strategy, Math.max(0, extraPerMonth));
  const baseline = simulate(debts, strategy, 0);

  const entries: PayoffEntry[] = plan.order.map((d, i) => ({
    debtId: d.id,
    order: i + 1,
    payoffMonthIndex: d.payoffMonth,
    payoffDate: d.payoffMonth ? isoAfterMonths(d.payoffMonth, now) : null,
    interestPaid: d.interestPaid,
  }));

  return {
    strategy,
    extraPerMonth: Math.max(0, extraPerMonth),
    totalMonths: plan.months,
    debtFreeDate: plan.viable ? isoAfterMonths(plan.months, now) : null,
    totalInterest: plan.totalInterest,
    totalPaid: plan.totalPaid,
    totalPrincipal: sumCents(debts.map((d) => d.balance)),
    viable: plan.viable,
    entries,
    timeline: plan.timeline,
    baseline: {
      totalMonths: baseline.months,
      totalInterest: baseline.totalInterest,
      debtFreeDate: baseline.viable ? isoAfterMonths(baseline.months, now) : null,
    },
    interestSaved: Math.max(0, baseline.totalInterest - plan.totalInterest),
    monthsSaved: Math.max(0, baseline.months - plan.months),
  };
}

export function buildDebtsOverview(debts: Debt[]): DebtsOverview {
  const totalBalance = sumCents(debts.map((d) => d.balance));
  const weightedAprBps =
    totalBalance > 0
      ? Math.round(sumCents(debts.map((d) => d.balance * d.aprBps)) / totalBalance)
      : 0;
  return {
    totalBalance,
    totalMinimum: sumCents(debts.map((d) => d.minimumPayment)),
    weightedAprBps,
    count: debts.length,
    debts,
  };
}
