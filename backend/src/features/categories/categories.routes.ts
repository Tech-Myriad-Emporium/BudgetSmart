import { CATEGORY_KINDS, ROLLOVER_MODES } from "@budgetsmart/shared";
import { Router } from "express";
import { z } from "zod";
import { categories } from "../../db/repo.js";
import { ApiError, asyncHandler, routeParam } from "../../lib/http.js";
import { serializeCategory } from "../../lib/serialize.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";

const createSchema = z.object({
  name: z.string().min(1).max(60),
  kind: z.enum(CATEGORY_KINDS),
  icon: z.string().min(1).max(8).default("💸"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a hex value").default("#00FF41"),
  rollover: z.enum(ROLLOVER_MODES).default("none"),
  hidden: z.boolean().default(false),
});

const updateSchema = createSchema.partial();

export const categoriesRouter = Router();
categoriesRouter.use(requireAuth);

categoriesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json({ categories: categories.listByUser(userIdOf(req)).map(serializeCategory) });
  }),
);

categoriesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const data = createSchema.parse(req.body);
    if (categories.findByName(userId, data.name)) {
      throw ApiError.conflict("A category with that name already exists");
    }
    const category = categories.create({ ...data, userId });
    res.status(201).json({ category: serializeCategory(category) });
  }),
);

categoriesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const data = updateSchema.parse(req.body);
    const existing = categories.findForUser(userId, routeParam(req, "id"));
    if (!existing) throw ApiError.notFound("Category not found");
    res.json({ category: serializeCategory(categories.update(existing.id, data)) });
  }),
);

categoriesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const existing = categories.findForUser(userId, routeParam(req, "id"));
    if (!existing) throw ApiError.notFound("Category not found");
    // Transactions keep their history; their categoryId becomes null via the FK rule.
    categories.remove(existing.id);
    res.status(204).end();
  }),
);
