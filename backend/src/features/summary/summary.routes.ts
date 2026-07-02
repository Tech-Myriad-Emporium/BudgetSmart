import { Router } from "express";
import { z } from "zod";
import { emailPrefs } from "../../db/repo.js";
import { asyncHandler } from "../../lib/http.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";
import { buildAndSendDigest, lastFullMonth } from "./summary.js";

export const summaryRouter = Router();
summaryRouter.use(requireAuth);

/** GET /summary/prefs → current opt-in state. */
summaryRouter.get(
  "/prefs",
  asyncHandler(async (req, res) => {
    const prefs = emailPrefs.get(userIdOf(req));
    res.json({ enabled: prefs.monthlyEmail === 1, lastSentMonth: prefs.lastSentMonth });
  }),
);

/** POST /summary/prefs → toggle the monthly email. */
summaryRouter.post(
  "/prefs",
  asyncHandler(async (req, res) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    const prefs = emailPrefs.setEnabled(userIdOf(req), enabled);
    res.json({ enabled: prefs.monthlyEmail === 1, lastSentMonth: prefs.lastSentMonth });
  }),
);

/** POST /summary/send-now → email last month's digest immediately. */
summaryRouter.post(
  "/send-now",
  asyncHandler(async (req, res) => {
    const month = lastFullMonth();
    const result = await buildAndSendDigest(userIdOf(req), month);
    if (!result.ok) {
      res.status(result.status >= 400 && result.status < 600 ? result.status : 502).json({ error: result.error });
      return;
    }
    res.json({ ok: true, month, sentTo: result.sentTo });
  }),
);
