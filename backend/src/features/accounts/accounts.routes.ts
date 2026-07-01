import { ACCOUNT_TYPES } from "@budgetsmart/shared";
import { Router } from "express";
import { z } from "zod";
import { accounts } from "../../db/repo.js";
import { computeBalancesForUser } from "../../lib/balances.js";
import { ApiError, asyncHandler, routeParam } from "../../lib/http.js";
import { serializeAccount } from "../../lib/serialize.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(ACCOUNT_TYPES),
  openingBalance: z.number().int().default(0),
  currency: z.string().length(3).default("USD"),
});

const updateSchema = createSchema.partial().extend({
  archived: z.boolean().optional(),
});

export const accountsRouter = Router();
accountsRouter.use(requireAuth);

accountsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const balances = computeBalancesForUser(userId);
    const list = accounts.listByUser(userId);
    res.json({ accounts: list.map((a) => serializeAccount(a, balances.get(a.id) ?? a.openingBalance)) });
  }),
);

accountsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const data = createSchema.parse(req.body);
    const account = accounts.create({ ...data, userId });
    res.status(201).json({ account: serializeAccount(account, account.openingBalance) });
  }),
);

accountsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const data = updateSchema.parse(req.body);
    const existing = accounts.findForUser(userId, routeParam(req, "id"));
    if (!existing) throw ApiError.notFound("Account not found");

    const updated = accounts.update(existing.id, data);
    const balances = computeBalancesForUser(userId);
    res.json({ account: serializeAccount(updated, balances.get(updated.id) ?? updated.openingBalance) });
  }),
);

accountsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const existing = accounts.findForUser(userId, routeParam(req, "id"));
    if (!existing) throw ApiError.notFound("Account not found");
    accounts.remove(existing.id);
    res.status(204).end();
  }),
);
