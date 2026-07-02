import { buildIntelligence } from "@budgetsmart/shared";
import { Router } from "express";
import { categories, debts, holdings, transactions } from "../../db/repo.js";
import { asyncHandler } from "../../lib/http.js";
import { serializeCategory, serializeDebt, serializeHolding, serializeTransaction } from "../../lib/serialize.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";
import { overridesFor } from "../recurring/recurring.routes.js";

export const intelligenceRouter = Router();
intelligenceRouter.use(requireAuth);

/**
 * GET /intelligence → tax projection, debt/investment intelligence, life
 * modeling, negotiation scripts & impulse guard. Optional employer-match
 * query params: ?salary=90000&contribPct=4&matchPct=100&matchCapPct=5
 * (salary in dollars).
 */
intelligenceRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const q = req.query;
    const num = (v: unknown): number | null => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    const salary = num(q.salary);
    const match =
      salary !== null && salary > 0
        ? {
            salary: Math.round(salary * 100),
            contribPct: num(q.contribPct) ?? 0,
            matchPct: num(q.matchPct) ?? 100,
            matchCapPct: num(q.matchCapPct) ?? 4,
          }
        : undefined;

    const summary = buildIntelligence({
      transactions: transactions.allByUser(userId).map(serializeTransaction),
      categories: categories.listByUser(userId).map(serializeCategory),
      debts: debts.listByUser(userId).map(serializeDebt),
      holdings: holdings.listByUser(userId).map(serializeHolding),
      match,
      recurringOverrides: overridesFor(userId),
    });
    res.json({ summary });
  }),
);
