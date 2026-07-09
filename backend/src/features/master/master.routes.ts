import { Router } from "express";
import { asyncHandler } from "../../lib/http.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";
import { buildLocalSnapshot, fetchOverview, pushSnapshot } from "./master.js";

export const masterRouter = Router();
masterRouter.use(requireAuth);

/** GET /master → the owner's cross-member overview (fresh: pushes ours first). */
masterRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    await pushSnapshot(userId); // make sure our own card is current
    const { status, body } = await fetchOverview(userId);
    res.status(status).json(body as object);
  }),
);

/** GET /master/mine → this device's snapshot (for members / preview). */
masterRouter.get(
  "/mine",
  asyncHandler(async (req, res) => {
    res.json({ snapshot: buildLocalSnapshot(userIdOf(req)) });
  }),
);
