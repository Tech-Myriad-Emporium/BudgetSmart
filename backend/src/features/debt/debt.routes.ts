import { DEBT_KINDS, DEBT_STRATEGIES, buildDebtsOverview, computePayoffPlan } from "@budgetsmart/shared";
import { Router } from "express";
import { z } from "zod";
import { debts } from "../../db/repo.js";
import { ApiError, asyncHandler, routeParam } from "../../lib/http.js";
import { serializeDebt } from "../../lib/serialize.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(DEBT_KINDS).default("credit_card"),
  icon: z.string().min(1).max(8).default("💳"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a hex value").default("#FF0033"),
  balance: z.number().int().min(0),
  aprBps: z.number().int().min(0).max(100000), // up to 1000% APR, sane bound
  minimumPayment: z.number().int().min(0),
});

const updateSchema = createSchema.partial();

const planSchema = z.object({
  strategy: z.enum(DEBT_STRATEGIES).default("avalanche"),
  extra: z.coerce.number().int().min(0).default(0),
});

export const debtRouter = Router();
debtRouter.use(requireAuth);

/** GET /debts → totals + the raw debts. */
debtRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const list = debts.listByUser(userIdOf(req)).map(serializeDebt);
    res.json({ overview: buildDebtsOverview(list) });
  }),
);

/** GET /debts/plan?strategy=&extra= → full payoff simulation. */
debtRouter.get(
  "/plan",
  asyncHandler(async (req, res) => {
    const { strategy, extra } = planSchema.parse(req.query);
    const list = debts.listByUser(userIdOf(req)).map(serializeDebt);
    res.json({ plan: computePayoffPlan(list, strategy, extra) });
  }),
);

debtRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const data = createSchema.parse(req.body);
    res.status(201).json({ debt: serializeDebt(debts.create({ ...data, userId })) });
  }),
);

debtRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const data = updateSchema.parse(req.body);
    const existing = debts.findForUser(userId, routeParam(req, "id"));
    if (!existing) throw ApiError.notFound("Debt not found");
    res.json({ debt: serializeDebt(debts.update(existing.id, data)) });
  }),
);

debtRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const existing = debts.findForUser(userId, routeParam(req, "id"));
    if (!existing) throw ApiError.notFound("Debt not found");
    debts.remove(existing.id);
    res.status(204).end();
  }),
);
