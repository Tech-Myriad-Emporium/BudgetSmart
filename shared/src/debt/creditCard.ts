import { clamp, type Cents } from "../money.js";
import type {
  CreditCardAnalysis,
  CreditCardScenario,
  CreditGainEstimate,
  UtilizationBand,
} from "../types.js";
import { isoAfterMonths } from "../goals/engine.js";
import { aprBpsToMonthlyRate } from "./engine.js";

const HORIZON_MONTHS = 600; // 50-year cap so the minimum-payment trap can't loop forever
const DEFAULT_MIN_FLOOR = 2500; // $25
const DEFAULT_MIN_PERCENT = 0.01; // 1% of balance

export interface MinPaymentOpts {
  /** Dollar floor in cents (default $25). */
  floor?: Cents;
  /** Fraction of balance (default 1%). */
  percent?: number;
}

/**
 * Issuer-style minimum payment: the greater of a dollar floor, or
 * (a percent of the balance + this month's interest). Never exceeds the payoff.
 */
export function creditCardMinimumPayment(balance: Cents, aprBps: number, opts: MinPaymentOpts = {}): Cents {
  if (balance <= 0) return 0;
  const floor = opts.floor ?? DEFAULT_MIN_FLOOR;
  const percent = opts.percent ?? DEFAULT_MIN_PERCENT;
  const interest = Math.round(balance * aprBpsToMonthlyRate(aprBps));
  const percentOption = Math.round(balance * percent) + interest;
  return Math.min(balance + interest, Math.max(floor, percentOption));
}

/** The fixed monthly payment that clears `balance` in exactly `months` (amortization). */
export function paymentForMonths(balance: Cents, aprBps: number, months: number): Cents {
  if (balance <= 0) return 0;
  if (months <= 0) return balance;
  const r = aprBpsToMonthlyRate(aprBps);
  if (r === 0) return Math.ceil(balance / months);
  const payment = (balance * r) / (1 - Math.pow(1 + r, -months));
  return Math.ceil(payment);
}

interface SimResult {
  months: number;
  totalInterest: Cents;
  totalPaid: Cents;
  viable: boolean;
}

/**
 * Simulate a card to payoff. Pass `payment` for a fixed payment, or
 * `recalcMinimum` to pay the (shrinking) issuer minimum each month — which
 * exposes the minimum-payment trap.
 */
export function simulateCardPayoff(
  balance: Cents,
  aprBps: number,
  opts: { payment?: Cents; recalcMinimum?: boolean; min?: MinPaymentOpts },
): SimResult {
  const rate = aprBpsToMonthlyRate(aprBps);
  let bal = balance;
  let months = 0;
  let totalInterest = 0;
  let totalPaid = 0;

  while (bal > 0 && months < HORIZON_MONTHS) {
    months++;
    const interest = Math.round(bal * rate);
    bal += interest;
    totalInterest += interest;

    const pay = opts.recalcMinimum
      ? creditCardMinimumPayment(bal - interest, aprBps, opts.min) // min on pre-interest balance, then +interest inside
      : (opts.payment ?? 0);

    // A fixed payment that doesn't beat the monthly interest never clears.
    if (!opts.recalcMinimum && pay <= interest && bal - pay > 0) {
      return { months: HORIZON_MONTHS, totalInterest, totalPaid, viable: false };
    }

    const applied = Math.min(pay, bal);
    bal -= applied;
    totalPaid += applied;
  }

  return { months, totalInterest, totalPaid, viable: bal <= 0 };
}

/* ------------------------------------------------------------------ *
 * Credit utilization → potential credit-score gains (rough estimate)
 * ------------------------------------------------------------------ */
function bandFor(util: number): UtilizationBand {
  if (util <= 0.1) return "excellent";
  if (util <= 0.3) return "good";
  if (util <= 0.5) return "fair";
  if (util <= 0.9) return "high";
  return "maxed";
}

export function estimateCreditGain(balance: Cents, creditLimit: Cents): CreditGainEstimate {
  const util = creditLimit > 0 ? balance / creditLimit : 0;
  // Utilization is ~30% of a FICO score; moving from very high to <=10% can swing
  // a meaningful chunk. This is an illustrative estimate, not a guarantee.
  const estimatedScoreGain = Math.round(clamp(util - 0.1, 0, 1) * 80);
  return {
    creditLimit,
    currentBalance: balance,
    currentUtilization: util,
    healthyBalance: Math.round(creditLimit * 0.3),
    excellentBalance: Math.round(creditLimit * 0.1),
    band: bandFor(util),
    estimatedScoreGain,
  };
}

/* ------------------------------------------------------------------ *
 * Full analysis — ties it all together
 * ------------------------------------------------------------------ */
export interface CreditCardInput {
  balance: Cents;
  aprBps: number;
  creditLimit: Cents;
  minFloor?: Cents;
  minPercent?: number;
  /** Optional custom "average" payoff target in months (default 36). */
  averageMonths?: number;
  /** Optional custom "most beneficial" target in months (default 12). */
  aggressiveMonths?: number;
}

export function analyzeCreditCard(input: CreditCardInput, now: Date = new Date()): CreditCardAnalysis {
  const { balance, aprBps, creditLimit } = input;
  const minOpts: MinPaymentOpts = { floor: input.minFloor, percent: input.minPercent };

  const minimumPayment = creditCardMinimumPayment(balance, aprBps, minOpts);
  const monthlyInterest = Math.round(balance * aprBpsToMonthlyRate(aprBps));

  const avgMonths = input.averageMonths ?? 36;
  const aggrMonths = input.aggressiveMonths ?? 12;
  const avgPay = paymentForMonths(balance, aprBps, avgMonths);
  const aggrPay = paymentForMonths(balance, aprBps, aggrMonths);

  const minSim = simulateCardPayoff(balance, aprBps, { recalcMinimum: true, min: minOpts });
  const avgSim = simulateCardPayoff(balance, aprBps, { payment: avgPay });
  const aggrSim = simulateCardPayoff(balance, aprBps, { payment: aggrPay });

  const toScenario = (key: string, label: string, payment: Cents, sim: SimResult): CreditCardScenario => ({
    key,
    label,
    monthlyPayment: payment,
    months: sim.months,
    totalInterest: sim.totalInterest,
    totalPaid: sim.totalPaid,
    payoffDate: sim.viable ? isoAfterMonths(sim.months, now) : null,
    viable: sim.viable,
  });

  const scenarios: CreditCardScenario[] = [
    toScenario("minimum", "Minimum only", minimumPayment, minSim),
    toScenario("average", `Average (~${Math.round(avgMonths / 12)} yr)`, avgPay, avgSim),
    toScenario("beneficial", `Most beneficial (~${aggrMonths} mo)`, aggrPay, aggrSim),
  ];
  const recommended = scenarios[2]!;

  return {
    balance,
    aprBps,
    minimumPayment,
    monthlyInterest,
    scenarios,
    recommended,
    interestSavedVsMin: Math.max(0, minSim.totalInterest - aggrSim.totalInterest),
    monthsSavedVsMin: Math.max(0, minSim.months - aggrSim.months),
    credit: estimateCreditGain(balance, creditLimit),
  };
}
