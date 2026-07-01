import {
  LIABILITY_ACCOUNT_TYPES,
  buildNetWorth,
  buildNetWorthBreakdown,
  buildPortfolio,
  sumCents,
  type AccountType,
  type NetWorthDetail,
} from "@budgetsmart/shared";
import { Router } from "express";
import { accounts, debts, holdings, transactions } from "../../db/repo.js";
import { computeBalancesForUser } from "../../lib/balances.js";
import { asyncHandler } from "../../lib/http.js";
import { serializeAccount, serializeHolding, serializeTransaction } from "../../lib/serialize.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";

export const netWorthRouter = Router();
netWorthRouter.use(requireAuth);

/** GET /networth → unified breakdown + 12-month history. */
netWorthRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const balances = computeBalancesForUser(userId);

    const accountList = accounts
      .listByUser(userId, { activeOnly: true })
      .map((a) => serializeAccount(a, balances.get(a.id) ?? a.openingBalance));

    const assetAccounts = sumCents(
      accountList.filter((a) => !LIABILITY_ACCOUNT_TYPES.has(a.type as AccountType)).map((a) => a.balance),
    );
    const liabilityAccounts = sumCents(
      accountList.filter((a) => LIABILITY_ACCOUNT_TYPES.has(a.type as AccountType)).map((a) => a.balance),
    );
    const investments = buildPortfolio(holdings.listByUser(userId).map(serializeHolding)).totalValue;
    const debtTotal = sumCents(debts.listByUser(userId).map((d) => d.balance));

    const breakdown = buildNetWorthBreakdown({
      assetAccounts,
      investments,
      liabilityAccounts,
      debts: debtTotal,
    });

    // History: accounts move month-to-month with activity; investments & debts are
    // held flat at today's value (we don't store their historical snapshots), so the
    // current-month point ties out exactly to the breakdown above.
    const txns = transactions.allByUser(userId).map(serializeTransaction);
    const offset = investments - debtTotal;
    const history = buildNetWorth(accountList, txns, monthsBack(12)).map((p) => ({
      month: p.month,
      assets: p.assets + investments,
      liabilities: p.liabilities + debtTotal,
      net: p.net + offset,
    }));

    const detail: NetWorthDetail = { breakdown, history };
    res.json({ detail });
  }),
);

function monthsBack(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(`${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
