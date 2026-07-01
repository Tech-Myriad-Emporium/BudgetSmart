import { buildBudgetSummary, currentMonth, isMonth, previousMonth } from "@budgetsmart/shared";
import { Router } from "express";
import { z } from "zod";
import { budgets, categories, transactions } from "../../db/repo.js";
import { ApiError, asyncHandler } from "../../lib/http.js";
import { serializeBudget, serializeCategory, serializeTransaction } from "../../lib/serialize.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";

const monthSchema = z.string().refine(isMonth, "Month must be YYYY-MM");

const upsertSchema = z.object({
  categoryId: z.string().min(1),
  month: monthSchema,
  limit: z.number().int().min(0),
});

export const budgetsRouter = Router();
budgetsRouter.use(requireAuth);

/** GET /budgets?month=YYYY-MM → computed summary + raw limit rows. */
budgetsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const month = monthSchema.parse(req.query.month ?? currentMonth());
    const prior = previousMonth(month);

    const monthBudgets = budgets.listByUserMonth(userId, month);
    const summary = buildBudgetSummary({
      month,
      categories: categories.listByUser(userId).map(serializeCategory),
      budgets: monthBudgets.map(serializeBudget),
      priorBudgets: budgets.listByUserMonth(userId, prior).map(serializeBudget),
      transactions: transactions.allByUser(userId).map(serializeTransaction),
    });

    res.json({ summary, budgets: monthBudgets.map(serializeBudget) });
  }),
);

/** PUT /budgets → upsert a category's limit for a month (limit 0 clears it). */
budgetsRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { categoryId, month, limit } = upsertSchema.parse(req.body);

    const category = categories.findForUser(userId, categoryId);
    if (!category) throw ApiError.badRequest("Unknown category");
    if (category.kind !== "expense") throw ApiError.badRequest("Only expense categories can be budgeted");

    if (limit === 0) {
      budgets.remove(userId, categoryId, month);
      res.json({ budget: null });
      return;
    }

    const budget = budgets.upsert(userId, categoryId, month, limit);
    res.json({ budget: serializeBudget(budget) });
  }),
);
