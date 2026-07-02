import { Router } from "express";
import { z } from "zod";
import { emailPrefs } from "../../db/repo.js";
import { asyncHandler } from "../../lib/http.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";
import { buildAndSendDigest, buildAndSendWeekly, lastFullMonth } from "./summary.js";

export const summaryRouter = Router();
summaryRouter.use(requireAuth);

/** GET /summary/prefs → current opt-in state. */
summaryRouter.get(
  "/prefs",
  asyncHandler(async (req, res) => {
    const prefs = emailPrefs.get(userIdOf(req));
    res.json({
      enabled: prefs.monthlyEmail === 1,
      lastSentMonth: prefs.lastSentMonth,
      weeklyEnabled: prefs.weeklyEmail === 1,
      lastSentWeek: prefs.lastSentWeek,
    });
  }),
);

/** POST /summary/prefs → toggle the monthly email. */
summaryRouter.post(
  "/prefs",
  asyncHandler(async (req, res) => {
    const body = z.object({ enabled: z.boolean().optional(), weeklyEnabled: z.boolean().optional() }).parse(req.body);
    const userId = userIdOf(req);
    if (body.enabled !== undefined) emailPrefs.setEnabled(userId, body.enabled);
    if (body.weeklyEnabled !== undefined) emailPrefs.setWeeklyEnabled(userId, body.weeklyEnabled);
    const prefs = emailPrefs.get(userId);
    res.json({
      enabled: prefs.monthlyEmail === 1,
      lastSentMonth: prefs.lastSentMonth,
      weeklyEnabled: prefs.weeklyEmail === 1,
      lastSentWeek: prefs.lastSentWeek,
    });
  }),
);

/** POST /summary/send-week-now: email last completed week's recap immediately. */
summaryRouter.post(
  "/send-week-now",
  asyncHandler(async (req, res) => {
    const result = await buildAndSendWeekly(userIdOf(req));
    if (!result.ok) {
      res.status(result.status >= 400 && result.status < 600 ? result.status : 502).json({ error: result.error });
      return;
    }
    res.json({ ok: true, sentTo: result.sentTo });
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
