import { buildReport, buildWeeklyReport } from "@budgetsmart/shared";
import { Router } from "express";
import { z } from "zod";
import { accounts, budgets, categories, transactions } from "../../db/repo.js";
import { asyncHandler } from "../../lib/http.js";
import { serializeAccount, serializeBudget, serializeCategory, serializeTransaction } from "../../lib/serialize.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";
import { overridesFor } from "../recurring/recurring.routes.js";

const reportSchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
});

const csvSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

/** GET /reports/weekly → this-week-so-far report (7-day window ending today). */
reportsRouter.get(
  "/weekly",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const month = new Date().toISOString().slice(0, 7);
    const report = buildWeeklyReport({
      transactions: transactions.allByUser(userId).map(serializeTransaction),
      categories: categories.listByUser(userId).map(serializeCategory),
      budgets: budgets.listByUserMonth(userId, month).map(serializeBudget),
      recurringOverrides: overridesFor(userId),
    });
    res.json({ report });
  }),
);

reportsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { months } = reportSchema.parse(req.query);
    const report = buildReport({
      months,
      // buildNetWorth recomputes balances itself, so a 0 placeholder is fine here.
      accounts: accounts.listByUser(userId).map((a) => serializeAccount(a, 0)),
      categories: categories.listByUser(userId).map(serializeCategory),
      transactions: transactions.allByUser(userId).map(serializeTransaction),
    });
    res.json({ report });
  }),
);

/** GET /reports/export.csv?from=&to= → downloadable transactions CSV. */
reportsRouter.get(
  "/export.csv",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { from, to } = csvSchema.parse(req.query);

    const accountName = new Map(accounts.listByUser(userId).map((a) => [a.id, a.name]));
    const categoryName = new Map(categories.listByUser(userId).map((c) => [c.id, c.name]));

    const rows = transactions
      .allByUser(userId)
      .map(serializeTransaction)
      .filter((t) => (!from || t.date >= from) && (!to || t.date <= to))
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    const header = ["Date", "Merchant", "Category", "Account", "Type", "Amount", "Pending", "Tags", "Note"];
    const lines = [header.join(",")];
    for (const t of rows) {
      const signed = t.type === "income" ? t.amount : t.type === "transfer" ? t.amount : -t.amount;
      lines.push(
        [
          t.date,
          t.merchant,
          t.categoryId ? categoryName.get(t.categoryId) ?? "" : "",
          accountName.get(t.accountId) ?? "",
          t.type,
          (signed / 100).toFixed(2),
          t.pending ? "yes" : "no",
          t.tags.join(" "),
          t.note ?? "",
        ]
          .map(csvCell)
          .join(","),
      );
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="budgetsmart-transactions.csv"`);
    res.send(lines.join("\r\n"));
  }),
);

/** Quote a CSV cell when it contains a comma, quote, or newline. */
function csvCell(value: string): string {
  const s = String(value ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
