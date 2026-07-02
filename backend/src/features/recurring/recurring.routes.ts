import { CADENCES, detectRecurring, normalizeMerchant, type RecurringOverride } from "@budgetsmart/shared";
import { Router } from "express";
import { z } from "zod";
import { categories, recurringOverrides, transactions } from "../../db/repo.js";
import { asyncHandler, routeParam } from "../../lib/http.js";
import { serializeCategory, serializeTransaction } from "../../lib/serialize.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";

/** DB rows → engine overrides. */
export function overridesFor(userId: string): RecurringOverride[] {
  return recurringOverrides.list(userId).map((o) => ({
    key: o.key,
    mode: o.mode as "always" | "never",
    merchant: o.merchant ?? undefined,
    cadence: (o.cadence ?? undefined) as RecurringOverride["cadence"],
    amount: o.amount ?? undefined,
  }));
}

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
      overrides: overridesFor(userId),
    });
    res.json({ summary, overrides: recurringOverrides.list(userId).map((o) => ({ key: o.key, mode: o.mode, merchant: o.merchant })) });
  }),
);

const overrideSchema = z.object({
  merchant: z.string().min(1).max(120),
  mode: z.enum(["always", "never"]),
  cadence: z.enum(CADENCES).optional(),
  amount: z.number().int().positive().optional(),
});

/** Customize detection: force a merchant to be recurring, or never recurring. */
recurringRouter.post(
  "/override",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const data = overrideSchema.parse(req.body);
    const key = normalizeMerchant(data.merchant);
    if (!key) throw new Error("Merchant name is required");
    recurringOverrides.set({ userId, key, mode: data.mode, merchant: data.merchant, cadence: data.cadence ?? null, amount: data.amount ?? null });
    res.status(201).json({ ok: true, key });
  }),
);

/** Remove a customization (detection returns to automatic). */
recurringRouter.delete(
  "/override/:key",
  asyncHandler(async (req, res) => {
    recurringOverrides.remove(userIdOf(req), routeParam(req, "key"));
    res.json({ ok: true });
  }),
);
