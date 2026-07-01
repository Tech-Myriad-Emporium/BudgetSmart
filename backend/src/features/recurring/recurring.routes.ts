import { detectRecurring } from "@budgetsmart/shared";
import { Router } from "express";
import { categories, transactions } from "../../db/repo.js";
import { asyncHandler } from "../../lib/http.js";
import { serializeCategory, serializeTransaction } from "../../lib/serialize.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";

export const recurringRouter = Router();
recurringRouter.use(requireAuth);

/** GET /recurring → detected recurring charges + upcoming + totals. */
recurringRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const summary = detectRecurring({
      transactions: transactions.allByUser(userId).map(serializeTransaction),
      categories: categories.listByUser(userId).map(serializeCategory),
      upcomingDays: 45,
    });
    res.json({ summary });
  }),
);
