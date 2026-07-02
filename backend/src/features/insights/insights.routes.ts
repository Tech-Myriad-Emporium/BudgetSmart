import { buildInsights } from "@budgetsmart/shared";
import { Router } from "express";
import { budgets, categories, transactions } from "../../db/repo.js";
import { asyncHandler } from "../../lib/http.js";
import { serializeBudget, serializeCategory, serializeTransaction } from "../../lib/serialize.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";

export const insightsRouter = Router();
insightsRouter.use(requireAuth);

/** GET /insights → cleanup suggestions, auto-tags, auto-budget & overspend alerts. */
insightsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const month = new Date().toISOString().slice(0, 7);
    const summary = buildInsights({
      transactions: transactions.allByUser(userId).map(serializeTransaction),
      categories: categories.listByUser(userId).map(serializeCategory),
      budgets: budgets.listByUserMonth(userId, month).map(serializeBudget),
    });
    res.json({ summary });
  }),
);
