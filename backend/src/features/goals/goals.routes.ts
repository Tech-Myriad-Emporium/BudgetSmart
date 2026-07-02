import { GOAL_TYPES, buildGoalsSummary } from "@budgetsmart/shared";
import { Router } from "express";
import { z } from "zod";
import { goals } from "../../db/repo.js";
import { ApiError, asyncHandler, routeParam } from "../../lib/http.js";
import { serializeGoal } from "../../lib/serialize.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const createSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(GOAL_TYPES).default("savings"),
  icon: z.string().min(1).max(8).default("🎯"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a hex value").default("#00FF41"),
  targetAmount: z.number().int().positive("Target must be greater than zero"),
  currentAmount: z.number().int().min(0).default(0),
  targetDate: isoDate.nullable().default(null),
  monthlyContribution: z.number().int().min(0).default(0),
  note: z.string().max(500).nullable().default(null),
  priority: z.number().int().min(0).default(0),
  shared: z.boolean().default(false),
});

const updateSchema = createSchema.partial();
const contributeSchema = z.object({ amount: z.number().int() });

export const goalsRouter = Router();
goalsRouter.use(requireAuth);

/** GET /goals → every goal plus computed progress + totals. */
goalsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const list = goals.listByUser(userIdOf(req)).map(serializeGoal);
    res.json({ summary: buildGoalsSummary(list) });
  }),
);

goalsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const data = createSchema.parse(req.body);
    const goal = goals.create({ ...data, userId });
    res.status(201).json({ goal: serializeGoal(goal) });
  }),
);

goalsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const data = updateSchema.parse(req.body);
    const existing = goals.findForUser(userId, routeParam(req, "id"));
    if (!existing) throw ApiError.notFound("Goal not found");
    res.json({ goal: serializeGoal(goals.update(existing.id, data)) });
  }),
);

/** POST /goals/:id/contribute → add (or subtract, if negative) toward the goal. */
goalsRouter.post(
  "/:id/contribute",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { amount } = contributeSchema.parse(req.body);
    const existing = goals.findForUser(userId, routeParam(req, "id"));
    if (!existing) throw ApiError.notFound("Goal not found");
    res.json({ goal: serializeGoal(goals.contribute(existing.id, amount)) });
  }),
);

goalsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const existing = goals.findForUser(userId, routeParam(req, "id"));
    if (!existing) throw ApiError.notFound("Goal not found");
    goals.remove(existing.id);
    res.status(204).end();
  }),
);
