import { sumCents, type Cents } from "../money.js";
import { categoryPalette } from "../design/tokens.js";
import {
  ASSET_CLASS_LABELS,
  type Allocation,
  type AssetClass,
  type GrowthProjection,
  type Holding,
  type HoldingMetrics,
  type Portfolio,
  type ProjectionPoint,
} from "../types.js";

/** Stable color per asset class, drawn from the on-brand palette. */
const ASSET_CLASS_COLORS: Record<AssetClass, string> = {
  stock: categoryPalette[0], // neon green
  etf: categoryPalette[1], // cyan
  crypto: categoryPalette[2], // yellow
  bond: categoryPalette[4], // purple
  cash: categoryPalette[6], // teal
  real_estate: categoryPalette[5], // orange
  other: "#5A5A5A",
};

export const holdingValue = (h: Pick<Holding, "quantity" | "currentPrice">): Cents =>
  Math.round(h.quantity * h.currentPrice);

export function withMetrics(h: Holding, totalValue: Cents): HoldingMetrics {
  const value = holdingValue(h);
  const gain = value - h.costBasis;
  return {
    ...h,
    value,
    gain,
    gainPct: h.costBasis > 0 ? gain / h.costBasis : 0,
    avgCost: h.quantity > 0 ? Math.round(h.costBasis / h.quantity) : 0,
    weight: totalValue > 0 ? value / totalValue : 0,
  };
}

export function buildPortfolio(holdings: Holding[]): Portfolio {
  const totalValue = sumCents(holdings.map(holdingValue));
  const totalCost = sumCents(holdings.map((h) => h.costBasis));
  const enriched = holdings
    .map((h) => withMetrics(h, totalValue))
    .sort((a, b) => b.value - a.value);

  // Allocation by asset class.
  const byClass = new Map<AssetClass, Cents>();
  for (const h of holdings) {
    byClass.set(h.assetClass, (byClass.get(h.assetClass) ?? 0) + holdingValue(h));
  }
  const allocation: Allocation[] = [...byClass.entries()]
    .map(([assetClass, value]) => ({
      assetClass,
      label: ASSET_CLASS_LABELS[assetClass],
      color: ASSET_CLASS_COLORS[assetClass],
      value,
      share: totalValue > 0 ? value / totalValue : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const totalGain = totalValue - totalCost;
  return {
    totalValue,
    totalCost,
    totalGain,
    totalGainPct: totalCost > 0 ? totalGain / totalCost : 0,
    allocation,
    holdings: enriched,
  };
}

/**
 * Forward growth projection with monthly contributions and monthly compounding.
 * `annualReturnPct` is a nominal annual rate (e.g. 7 for 7%).
 */
export function projectGrowth(
  startValue: Cents,
  monthlyContribution: Cents,
  annualReturnPct: number,
  years: number,
): GrowthProjection {
  const yrs = Math.max(0, Math.min(60, Math.round(years)));
  const monthlyRate = annualReturnPct / 100 / 12;

  let value = startValue;
  const points: ProjectionPoint[] = [
    { year: 0, value: startValue, contributed: startValue, growth: 0 },
  ];

  for (let year = 1; year <= yrs; year++) {
    for (let m = 0; m < 12; m++) {
      value = value * (1 + monthlyRate) + monthlyContribution;
    }
    const contributed = startValue + monthlyContribution * 12 * year;
    points.push({
      year,
      value: Math.round(value),
      contributed,
      growth: Math.round(value) - contributed,
    });
  }

  const last = points[points.length - 1]!;
  return {
    years: yrs,
    monthlyContribution,
    annualReturnPct,
    startValue,
    endValue: last.value,
    totalContributed: last.contributed,
    totalGrowth: last.growth,
    points,
  };
}
