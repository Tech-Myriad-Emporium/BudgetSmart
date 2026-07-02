import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { env } from "./env.js";
import { accountRouter } from "./features/account/account.routes.js";
import { accountsRouter } from "./features/accounts/accounts.routes.js";
import { authRouter } from "./features/auth/auth.routes.js";
import { budgetsRouter } from "./features/budgets/budgets.routes.js";
import { categoriesRouter } from "./features/categories/categories.routes.js";
import { dashboardRouter } from "./features/dashboard/dashboard.routes.js";
import { debtRouter } from "./features/debt/debt.routes.js";
import { familyRouter } from "./features/family/family.routes.js";
import { forecastRouter } from "./features/forecast/forecast.routes.js";
import { gamificationRouter } from "./features/gamification/gamification.routes.js";
import { importRouter } from "./features/import/import.routes.js";
import { insightsRouter } from "./features/insights/insights.routes.js";
import { pulseRouter } from "./features/pulse/pulse.routes.js";
import { intelligenceRouter } from "./features/intelligence/intelligence.routes.js";
import { goalsRouter } from "./features/goals/goals.routes.js";
import { investmentsRouter } from "./features/investments/investments.routes.js";
import { netWorthRouter } from "./features/networth/networth.routes.js";
import { recurringRouter } from "./features/recurring/recurring.routes.js";
import { reportsRouter } from "./features/reports/reports.routes.js";
import { subscriptionRouter } from "./features/subscription/subscription.routes.js";
import { summaryRouter } from "./features/summary/summary.routes.js";
import { transactionsRouter } from "./features/transactions/transactions.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { requireAuth } from "./middleware/auth.js";
import { requireFeature } from "./middleware/entitlements.js";

export function createServer() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  // 8mb so a full year's bank statement file fits through /api/import.
  app.use(express.json({ limit: "8mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "budgetsmart-api", time: new Date().toISOString() });
  });

  // Base-tier (level 0) routers — available to every paying user.
  app.use("/api/auth", authRouter);
  app.use("/api/accounts", accountsRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/transactions", transactionsRouter);
  app.use("/api/budgets", budgetsRouter);
  app.use("/api/goals", goalsRouter);
  app.use("/api/debts", debtRouter);
  app.use("/api/subscription", subscriptionRouter);
  app.use("/api/account", accountRouter);
  app.use("/api/dashboard", dashboardRouter);

  // Plan-gated routers. `requireAuth` sets req.userId; `requireFeature` then
  // 403s if the caller's tier doesn't grant the feature.
  app.use("/api/recurring", requireAuth, requireFeature("recurring"), recurringRouter);
  app.use("/api/reports", requireAuth, requireFeature("reports"), reportsRouter);
  app.use("/api/insights", requireAuth, requireFeature("insights"), insightsRouter);
  app.use("/api/import", requireAuth, requireFeature("import"), importRouter);
  app.use("/api/summary", requireAuth, requireFeature("monthlyEmail"), summaryRouter);
  app.use("/api/forecast", requireAuth, requireFeature("forecast"), forecastRouter);
  app.use("/api/pulse", requireAuth, requireFeature("ai"), pulseRouter);
  app.use("/api/intelligence", requireAuth, requireFeature("intelligence"), intelligenceRouter);
  app.use("/api/investments", requireAuth, requireFeature("investments"), investmentsRouter);
  app.use("/api/networth", requireAuth, requireFeature("networth"), netWorthRouter);
  app.use("/api/gamification", requireAuth, requireFeature("gamification"), gamificationRouter);
  app.use("/api/family", requireAuth, requireFeature("family"), familyRouter);

  // Serve the built web UI from the same origin (used by the packaged desktop app),
  // so the frontend's relative /api calls work without CORS. Enabled when WEB_DIST is set.
  const webDist = process.env.WEB_DIST;
  if (webDist && existsSync(webDist)) {
    app.use(express.static(webDist));
    // SPA fallback: any non-API GET falls back to index.html for client-side routing.
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api") || req.path === "/health") return next();
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
