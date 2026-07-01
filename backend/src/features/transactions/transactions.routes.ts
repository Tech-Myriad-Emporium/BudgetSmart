import { TRANSACTION_TYPES } from "@budgetsmart/shared";
import { Router } from "express";
import { z } from "zod";
import { accounts, categories, transactions, type TxFilter } from "../../db/repo.js";
import { ApiError, asyncHandler, routeParam } from "../../lib/http.js";
import { serializeTransaction } from "../../lib/serialize.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const baseFields = {
  accountId: z.string().min(1),
  transferAccountId: z.string().min(1).nullable().optional(),
  categoryId: z.string().min(1).nullable().optional(),
  type: z.enum(TRANSACTION_TYPES),
  amount: z.number().int().positive("Amount must be greater than zero"),
  merchant: z.string().max(120).default(""),
  note: z.string().max(500).nullable().optional(),
  date: isoDate,
  pending: z.boolean().default(false),
  excluded: z.boolean().default(false),
  tags: z.array(z.string().max(40)).max(20).default([]),
};

const createSchema = z.object(baseFields).refine(
  (t) => t.type !== "transfer" || (t.transferAccountId && t.transferAccountId !== t.accountId),
  { message: "Transfers need a different destination account", path: ["transferAccountId"] },
);

const updateSchema = z.object({
  accountId: baseFields.accountId.optional(),
  transferAccountId: baseFields.transferAccountId,
  categoryId: baseFields.categoryId,
  type: baseFields.type.optional(),
  amount: baseFields.amount.optional(),
  merchant: z.string().max(120).optional(),
  note: baseFields.note,
  date: isoDate.optional(),
  pending: z.boolean().optional(),
  excluded: z.boolean().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});

const filterSchema = z.object({
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  minAmount: z.coerce.number().int().optional(),
  maxAmount: z.coerce.number().int().optional(),
  search: z.string().optional(),
  tag: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

export const transactionsRouter = Router();
transactionsRouter.use(requireAuth);

/** Verify the given account/category ids belong to the user. */
function assertOwnership(
  userId: string,
  ids: { accountId?: string | null; transferAccountId?: string | null; categoryId?: string | null },
): void {
  const accountIds = [ids.accountId, ids.transferAccountId].filter((x): x is string => !!x);
  const unique = [...new Set(accountIds)];
  if (unique.length && accounts.countOwned(userId, unique) !== unique.length) {
    throw ApiError.badRequest("Unknown account");
  }
  if (ids.categoryId && !categories.findForUser(userId, ids.categoryId)) {
    throw ApiError.badRequest("Unknown category");
  }
}

transactionsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const f = filterSchema.parse(req.query);
    const filter: TxFilter = {
      accountId: f.accountId,
      categoryId: f.categoryId,
      type: f.type,
      from: f.from,
      to: f.to,
      minAmount: f.minAmount,
      maxAmount: f.maxAmount,
      search: f.search?.trim() || undefined,
      tag: f.tag,
    };
    const list = transactions.list(userId, filter, f.limit, f.offset);
    const total = transactions.count(userId, filter);
    res.json({ transactions: list.map(serializeTransaction), total, limit: f.limit, offset: f.offset });
  }),
);

transactionsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const data = createSchema.parse(req.body);
    assertOwnership(userId, data);

    const tx = transactions.create({
      userId,
      accountId: data.accountId,
      transferAccountId: data.type === "transfer" ? data.transferAccountId ?? null : null,
      categoryId: data.type === "transfer" ? null : data.categoryId ?? null,
      type: data.type,
      amount: data.amount,
      merchant: data.merchant,
      note: data.note ?? null,
      date: data.date,
      pending: data.pending,
      excluded: data.excluded,
      tags: JSON.stringify(data.tags),
    });
    res.status(201).json({ transaction: serializeTransaction(tx) });
  }),
);

transactionsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const data = updateSchema.parse(req.body);
    const existing = transactions.findForUser(userId, routeParam(req, "id"));
    if (!existing) throw ApiError.notFound("Transaction not found");
    assertOwnership(userId, data);

    const updated = transactions.update(existing.id, {
      accountId: data.accountId,
      transferAccountId: data.transferAccountId,
      categoryId: data.categoryId,
      type: data.type,
      amount: data.amount,
      merchant: data.merchant,
      note: data.note,
      date: data.date,
      pending: data.pending,
      excluded: data.excluded,
      tags: data.tags === undefined ? undefined : JSON.stringify(data.tags),
    });
    res.json({ transaction: serializeTransaction(updated) });
  }),
);

transactionsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const existing = transactions.findForUser(userId, routeParam(req, "id"));
    if (!existing) throw ApiError.notFound("Transaction not found");
    transactions.remove(existing.id);
    res.status(204).end();
  }),
);
