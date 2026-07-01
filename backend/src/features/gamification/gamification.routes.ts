import {
  LIABILITY_ACCOUNT_TYPES,
  buildGamification,
  buildPortfolio,
  detectRecurring,
  sumCents,
  type AccountType,
  type GamificationStats,
} from "@budgetsmart/shared";
import { Router } from "express";
import { accounts, budgets, categories, debts, goals, holdings, transactions } from "../../db/repo.js";
import { computeBalancesForUser } from "../../lib/balances.js";
import { asyncHandler } from "../../lib/http.js";
import { serializeCategory, serializeHolding, serializeTransaction } from "../../lib/serialize.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";

export const gamificationRouter = Router();
gamificationRouter.use(requireAuth);

/** GET /gamification → XP, level, streaks, achievements, challenges (all derived). */
gamificationRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);

    const txns = transactions.allByUser(userId).map(serializeTransaction);
    const cats = categories.listByUser(userId).map(serializeCategory);
    const goalRows = goals.listByUser(userId);
    const holdingList = holdings.listByUser(userId);

    // net worth (unified) for the "in the black" achievement
    const balances = computeBalancesForUser(userId);
    const accountList = accounts.listByUser(userId, { activeOnly: true });
    const assetAccounts = sumCents(
      accountList
        .filter((a) => !LIABILITY_ACCOUNT_TYPES.has(a.type as AccountType))
        .map((a) => balances.get(a.id) ?? a.openingBalance),
    );
    const liabilityAccounts = sumCents(
      accountList
        .filter((a) => LIABILITY_ACCOUNT_TYPES.has(a.type as AccountType))
        .map((a) => balances.get(a.id) ?? a.openingBalance),
    );
    const investments = buildPortfolio(holdingList.map(serializeHolding)).totalValue;
    const debtTotal = sumCents(debts.listByUser(userId).map((d) => d.balance));
    const netWorthPositive = assetAccounts + investments - liabilityAccounts - debtTotal > 0;

    const recurringDetected = detectRecurring({ transactions: txns, categories: cats }).items.length;

    const stats: GamificationStats = {
      transactionCount: txns.length,
      activeDays: [...new Set(txns.map((t) => t.date))],
      budgetsSet: budgets.distinctCategoryCount(userId),
      goalsCreated: goalRows.length,
      goalsReached: goalRows.filter((g) => g.targetAmount > 0 && g.currentAmount >= g.targetAmount).length,
      debtsTracked: debts.listByUser(userId).length,
      holdings: holdingList.length,
      recurringDetected,
      netWorthPositive,
      monthsTracked: new Set(txns.map((t) => t.date.slice(0, 7))).size,
    };

    res.json({ state: buildGamification(stats) });
  }),
);
