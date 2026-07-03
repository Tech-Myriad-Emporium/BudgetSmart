// Investment backtesting: replay a monthly dollar-cost-average plan against
// real historical closes ("what if I'd invested $200/mo since 2018?").
import type { Cents } from "../money.js";

export interface HistoryPoint {
  month: string; // YYYY-MM
  close: number;
}

export interface BacktestPoint {
  month: string;
  invested: Cents;
  value: Cents;
}

export interface BacktestResult {
  symbol: string;
  startMonth: string;
  endMonth: string;
  months: number;
  invested: Cents;
  finalValue: Cents;
  gain: Cents;
  /** gain / invested (0.42 = +42%). */
  gainPct: number;
  points: BacktestPoint[];
}

/** Buy `monthlyCents` of the asset at each month's close, from startMonth on. */
export function runBacktest(
  symbol: string,
  closes: HistoryPoint[],
  monthlyCents: Cents,
  startMonth: string,
): BacktestResult | null {
  const series = closes.filter((p) => p.month >= startMonth && p.close > 0);
  if (series.length < 2 || monthlyCents <= 0) return null;

  let units = 0;
  let invested = 0;
  const points: BacktestPoint[] = [];
  for (const p of series) {
    units += monthlyCents / 100 / p.close;
    invested += monthlyCents;
    points.push({ month: p.month, invested, value: Math.round(units * p.close * 100) });
  }
  const finalValue = points[points.length - 1]!.value;
  return {
    symbol: symbol.toUpperCase(),
    startMonth: series[0]!.month,
    endMonth: series[series.length - 1]!.month,
    months: series.length,
    invested,
    finalValue,
    gain: finalValue - invested,
    gainPct: invested > 0 ? Math.round(((finalValue - invested) / invested) * 1000) / 1000 : 0,
    points,
  };
}
