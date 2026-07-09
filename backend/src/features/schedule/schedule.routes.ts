import { Router } from "express";
import { z } from "zod";
import { scheduledCharges } from "../../db/repo.js";
import type { ScheduledChargeRow } from "../../db/rows.js";
import { ApiError, asyncHandler, routeParam } from "../../lib/http.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";
import { processDueCharges } from "./schedule.js";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const baseChargeSchema = z.object({
  name: z.string().min(1).max(80),
  icon: z.string().max(8).default("📌"),
  amount: z.number().int().positive("Amount must be greater than zero"),
  direction: z.enum(["expense", "income"]).default("expense"),
  type: z.enum(["recurring", "once", "custom"]),
  cadence: z.enum(["weekly", "biweekly", "monthly", "yearly"]).nullish(),
  intervalDays: z.number().int().min(1).max(730).nullish(),
  nextDate: z.string().regex(dateRe, "Use YYYY-MM-DD"),
  endDate: z.string().regex(dateRe).nullish(),
  categoryId: z.string().nullish(),
  accountId: z.string().nullish(),
  autoPost: z.boolean().default(false),
});

const chargeSchema = baseChargeSchema.superRefine((v, ctx) => {
  if (v.type === "recurring" && !v.cadence) {
    ctx.addIssue({ code: "custom", path: ["cadence"], message: "Pick how often it repeats" });
  }
  if (v.type === "custom" && !v.intervalDays) {
    ctx.addIssue({ code: "custom", path: ["intervalDays"], message: "Set the interval in days" });
  }
});

export const serializeScheduledCharge = (r: ScheduledChargeRow) => ({
  id: r.id,
  name: r.name,
  icon: r.icon,
  amount: r.amount,
  direction: r.direction as "expense" | "income",
  type: r.type as "recurring" | "once" | "custom",
  cadence: r.cadence as "weekly" | "biweekly" | "monthly" | "yearly" | null,
  intervalDays: r.intervalDays,
  nextDate: r.nextDate,
  endDate: r.endDate,
  categoryId: r.categoryId,
  accountId: r.accountId,
  autoPost: r.autoPost === 1,
  active: r.active === 1,
});

export const scheduleRouter = Router();
scheduleRouter.use(requireAuth);

/** GET /schedule → the user's scheduled charges. */
scheduleRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json({ charges: scheduledCharges.list(userIdOf(req)).map(serializeScheduledCharge) });
  }),
);

/** POST /schedule → create a charge (and immediately post it if already due). */
scheduleRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = chargeSchema.parse(req.body);
    const r = scheduledCharges.create({
      userId: userIdOf(req),
      name: data.name,
      icon: data.icon,
      amount: data.amount,
      direction: data.direction,
      type: data.type,
      cadence: data.cadence ?? null,
      intervalDays: data.intervalDays ?? null,
      nextDate: data.nextDate,
      endDate: data.endDate ?? null,
      categoryId: data.categoryId ?? null,
      accountId: data.accountId ?? null,
      autoPost: data.autoPost ? 1 : 0,
      active: 1,
    });
    processDueCharges(); // a past-dated charge posts right away
    res.status(201).json({ charge: serializeScheduledCharge(scheduledCharges.findForUser(userIdOf(req), r.id) ?? r) });
  }),
);

/** PATCH /schedule/:id */
scheduleRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const existing = scheduledCharges.findForUser(userId, routeParam(req, "id"));
    if (!existing) throw ApiError.notFound("Scheduled charge not found");
    const data = baseChargeSchema.partial().parse(req.body);
    const updated = scheduledCharges.update(existing.id, {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.icon !== undefined ? { icon: data.icon } : {}),
      ...(data.amount !== undefined ? { amount: data.amount } : {}),
      ...(data.direction !== undefined ? { direction: data.direction } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.cadence !== undefined ? { cadence: data.cadence ?? null } : {}),
      ...(data.intervalDays !== undefined ? { intervalDays: data.intervalDays ?? null } : {}),
      ...(data.nextDate !== undefined ? { nextDate: data.nextDate, active: 1 } : {}),
      ...(data.endDate !== undefined ? { endDate: data.endDate ?? null } : {}),
      ...(data.categoryId !== undefined ? { categoryId: data.categoryId ?? null } : {}),
      ...(data.accountId !== undefined ? { accountId: data.accountId ?? null } : {}),
      ...(data.autoPost !== undefined ? { autoPost: data.autoPost ? 1 : 0 } : {}),
    });
    res.json({ charge: serializeScheduledCharge(updated) });
  }),
);

/** DELETE /schedule/:id */
scheduleRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const existing = scheduledCharges.findForUser(userId, routeParam(req, "id"));
    if (!existing) throw ApiError.notFound("Scheduled charge not found");
    scheduledCharges.remove(existing.id);
    res.status(204).end();
  }),
);
