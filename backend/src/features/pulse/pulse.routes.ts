import { buildGoalsSummary, buildPulse, computePayoffPlan } from "@budgetsmart/shared";
import { Router } from "express";
import { budgets, categories, debts, goals, transactions } from "../../db/repo.js";
import { asyncHandler } from "../../lib/http.js";
import { serializeBudget, serializeCategory, serializeDebt, serializeGoal, serializeTransaction } from "../../lib/serialize.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";

export const pulseRouter = Router();
pulseRouter.use(requireAuth);

/** GET /pulse → health score, spending explanations, smart alerts & daily ritual. */
pulseRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const month = new Date().toISOString().slice(0, 7);
    const userDebts = debts.listByUser(userId).map(serializeDebt);
    const summary = buildPulse({
      transactions: transactions.allByUser(userId).map(serializeTransaction),
      categories: categories.listByUser(userId).map(serializeCategory),
      budgets: budgets.listByUserMonth(userId, month).map(serializeBudget),
      goals: buildGoalsSummary(goals.listByUser(userId).map(serializeGoal)),
      payoff: userDebts.length > 0 ? computePayoffPlan(userDebts, "avalanche", 0) : null,
    });
    res.json({ summary });
  }),
);
