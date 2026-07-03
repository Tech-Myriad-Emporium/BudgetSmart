import { ASSET_CLASSES, buildPortfolio, projectGrowth } from "@budgetsmart/shared";
import { Router } from "express";
import { z } from "zod";
import { holdings } from "../../db/repo.js";
import { env } from "../../env.js";
import { ApiError, asyncHandler, routeParam } from "../../lib/http.js";
import { serializeHolding } from "../../lib/serialize.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";

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

/** Map an app symbol to the market hub's provider symbol (crypto pairs). */
function providerSymbol(symbol: string, assetClass: string): string {
  const s = symbol.trim().toUpperCase();
  if (!s || s.includes(":")) return s;
  if (assetClass === "crypto") return `BINANCE:${s}USDT`;
  return s;
}

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

/** POST /investments/refresh-prices — pull live market quotes into holdings. */
investmentsRouter.post(
  "/refresh-prices",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const list = holdings.listByUser(userId).filter((h) => h.symbol.trim().length > 0);
    if (list.length === 0) {
      res.json({ updated: 0, skipped: 0 });
      return;
    }
    const bySymbol = new Map<string, typeof list>();
    for (const h of list) {
      const key = providerSymbol(h.symbol, h.assetClass);
      (bySymbol.get(key) ?? bySymbol.set(key, [] as typeof list).get(key)!).push(h);
    }
    const symbols = [...bySymbol.keys()].slice(0, 15);
    let quotes: Array<{ symbol: string; price: number }> = [];
    try {
      const r = await fetch(`${env.centralApiUrl}/market/quote?symbols=${encodeURIComponent(symbols.join(","))}`, {
        signal: AbortSignal.timeout(15000),
      });
      if (r.ok) quotes = ((await r.json()) as { quotes: Array<{ symbol: string; price: number }> }).quotes ?? [];
    } catch {
      throw ApiError.badRequest("Couldn't reach the market service — are you online?");
    }
    let updated = 0;
    for (const q of quotes) {
      for (const h of bySymbol.get(q.symbol) ?? []) {
        holdings.update(h.id, { currentPrice: Math.round(q.price * 100) });
        updated++;
      }
    }
    res.json({ updated, skipped: list.length - updated });
  }),
);
