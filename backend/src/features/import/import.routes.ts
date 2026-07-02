import { analyzeImport, parseStatement, TRANSACTION_TYPES } from "@budgetsmart/shared";
import { Router } from "express";
import { z } from "zod";
import { accounts, categories, transactions } from "../../db/repo.js";
import { ApiError, asyncHandler } from "../../lib/http.js";
import { serializeCategory, serializeTransaction } from "../../lib/serialize.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";

export const importRouter = Router();
importRouter.use(requireAuth);

const mappingSchema = z
  .object({
    dateCol: z.number().int().min(0),
    descCol: z.number().int().min(0),
    amountCol: z.number().int().min(0).optional(),
    debitCol: z.number().int().min(0).optional(),
    creditCol: z.number().int().min(0).optional(),
  })
  .refine((m) => m.amountCol !== undefined || (m.debitCol !== undefined && m.creditCol !== undefined), {
    message: "Mapping needs an amount column or debit+credit columns",
  });

const previewSchema = z.object({
  content: z.string().min(1).max(6_000_000),
  mapping: mappingSchema.optional(),
});

/** POST /import/preview → parse a statement file and analyze it (no writes). */
importRouter.post(
  "/preview",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { content, mapping } = previewSchema.parse(req.body);
    const parsed = parseStatement(content, { mapping });
    const analysis = analyzeImport(
      parsed,
      transactions.allByUser(userId).map(serializeTransaction),
      categories.listByUser(userId).map(serializeCategory),
    );
    res.json({ analysis });
  }),
);

const commitSchema = z.object({
  accountId: z.string().min(1),
  rows: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        amount: z.number().int().positive(),
        type: z.enum(TRANSACTION_TYPES),
        merchant: z.string().max(120),
        note: z.string().max(500).nullable(),
        categoryId: z.string().min(1).nullable(),
      }),
    )
    .min(1)
    .max(5000),
});

/** POST /import/commit → create the selected rows as transactions. */
importRouter.post(
  "/commit",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { accountId, rows } = commitSchema.parse(req.body);
    if (!accounts.findForUser(userId, accountId)) throw new ApiError(404, "Account not found");

    const validCategories = new Set(categories.listByUser(userId).map((c) => c.id));
    let created = 0;
    for (const row of rows) {
      transactions.create({
        userId,
        accountId,
        transferAccountId: null,
        categoryId: row.categoryId && validCategories.has(row.categoryId) ? row.categoryId : null,
        type: row.type,
        amount: row.amount,
        merchant: row.merchant,
        note: row.note,
        date: row.date,
        pending: false,
        excluded: false,
        tags: JSON.stringify(["imported"]),
      });
      created++;
    }
    res.status(201).json({ created });
  }),
);
