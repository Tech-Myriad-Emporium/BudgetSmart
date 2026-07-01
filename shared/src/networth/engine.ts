import type { Cents } from "../money.js";
import type { NetWorthBreakdown, NetWorthComponent } from "../types.js";

const COLORS = {
  accounts: "#00FF41",
  investments: "#00E0FF",
  liabilityAccounts: "#FF0033",
  debts: "#FF7A00",
} as const;

export interface NetWorthInput {
  /** Combined balance of non-liability accounts (cash/checking/savings). */
  assetAccounts: Cents;
  /** Total investment/portfolio value. */
  investments: Cents;
  /** Amount owed on liability-type accounts (credit/loan). */
  liabilityAccounts: Cents;
  /** Total of separately tracked debts. */
  debts: Cents;
}

/** Assemble the unified net-worth breakdown from its four buckets. */
export function buildNetWorthBreakdown(input: NetWorthInput): NetWorthBreakdown {
  const { assetAccounts, investments, liabilityAccounts, debts } = input;
  const totalAssets = assetAccounts + investments;
  const totalLiabilities = liabilityAccounts + debts;
  const net = totalAssets - totalLiabilities;

  const share = (value: Cents, total: Cents) => (total > 0 ? value / total : 0);

  const allComponents: NetWorthComponent[] = [
    { key: "accounts", label: "Cash & accounts", value: assetAccounts, kind: "asset", color: COLORS.accounts, share: share(assetAccounts, totalAssets) },
    { key: "investments", label: "Investments", value: investments, kind: "asset", color: COLORS.investments, share: share(investments, totalAssets) },
    { key: "liabilityAccounts", label: "Credit & loans", value: liabilityAccounts, kind: "liability", color: COLORS.liabilityAccounts, share: share(liabilityAccounts, totalLiabilities) },
    { key: "debts", label: "Tracked debts", value: debts, kind: "liability", color: COLORS.debts, share: share(debts, totalLiabilities) },
  ];
  const components = allComponents.filter((c) => c.value !== 0);

  return {
    assetAccounts,
    investments,
    totalAssets,
    liabilityAccounts,
    debts,
    totalLiabilities,
    net,
    leverage: totalAssets > 0 ? totalLiabilities / totalAssets : 0,
    components,
  };
}
