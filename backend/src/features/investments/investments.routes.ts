import { ASSET_CLASSES, buildPortfolio, projectGrowth } from "@budgetsmart/shared";
import { Router } from "express";
import { z } from "zod";
import { holdings } from "../../db/repo.js";
import { ApiError, asyncHandler, routeParam } from "../../lib/http.js";
import { serializeHolding } from "../../lib/serialize.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";
import { refreshUserPrices } from "./priceSync.js";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  symbol: z.string().max(12).default(""),
  assetClass: z.enum(ASSET_CLASSES).default("stock"),
  accountLabel: z.string().max(40).default("Brokerage"),
  quantity: z.number().positive("Quantity must be greater than zero"),
  costBasis: z.number().int().min(0),
  currentPrice: z.number().int().min(0),
});

const updateSchema = createSchema.partial();

const projectionSchema = z.object({
  monthly: z.coerce.number().int().min(0).default(0),
  returnPct: z.coerce.number().min(-50).max(50).default(7),
  years: z.coerce.number().int().min(1).max(60).default(20),
});

export const investmentsRouter = Router();
investmentsRouter.use(requireAuth);

/** GET /investments → portfolio with per-holding metrics + allocation. */
investmentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const list = holdings.listByUser(userIdOf(req)).map(serializeHolding);
    res.json({ portfolio: buildPortfolio(list) });
  }),
);

/** GET /investments/projection?monthly=&returnPct=&years= → growth forecast. */
investmentsRouter.get(
  "/projection",
  asyncHandler(async (req, res) => {
    const { monthly, returnPct, years } = projectionSchema.parse(req.query);
    const list = holdings.listByUser(userIdOf(req)).map(serializeHolding);
    const startValue = buildPortfolio(list).totalValue;
    res.json({ projection: projectGrowth(startValue, monthly, returnPct, years) });
  }),
);

investmentsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const data = createSchema.parse(req.body);
    res.status(201).json({ holding: serializeHolding(holdings.create({ ...data, userId })) });
  }),
);

investmentsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const data = updateSchema.parse(req.body);
    const existing = holdings.findForUser(userId, routeParam(req, "id"));
    if (!existing) throw ApiError.notFound("Holding not found");
    res.json({ holding: serializeHolding(holdings.update(existing.id, data)) });
  }),
);

investmentsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const existing = holdings.findForUser(userId, routeParam(req, "id"));
    if (!existing) throw ApiError.notFound("Holding not found");
    holdings.remove(existing.id);
    res.status(204).end();
  }),
);

/** POST /investments/refresh-prices — pull live market quotes into holdings.
 *  (Also runs automatically in the background — see priceSync.ts.) */
investmentsRouter.post(
  "/refresh-prices",
  asyncHandler(async (req, res) => {
    try {
      res.json(await refreshUserPrices(userIdOf(req)));
    } catch {
      throw ApiError.badRequest("Couldn't reach the market service — are you online?");
    }
  }),
);
