import { buildForecast } from "@budgetsmart/shared";
import { Router } from "express";
import { accounts, categories, transactions } from "../../db/repo.js";
import { computeBalancesForUser } from "../../lib/balances.js";
import { asyncHandler } from "../../lib/http.js";
import { serializeAccount, serializeCategory, serializeTransaction } from "../../lib/serialize.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";

export const forecastRouter = Router();
forecastRouter.use(requireAuth);

/** GET /forecast → 90-day cashflow projection, pacing, sinking funds & advice. */
forecastRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const balances = computeBalancesForUser(userId);
    const summary = buildForecast({
      transactions: transactions.allByUser(userId).map(serializeTransaction),
      categories: categories.listByUser(userId).map(serializeCategory),
      accounts: accounts
        .listByUser(userId, { activeOnly: true })
        .map((a) => serializeAccount(a, balances.get(a.id) ?? a.openingBalance)),
    });
    res.json({ summary });
  }),
);
