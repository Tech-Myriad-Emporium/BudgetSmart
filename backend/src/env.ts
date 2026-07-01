import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Load the repo-root .env (one level above backend/) plus any local override.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config(); // also pick up backend/.env if present

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value == null || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: required("JWT_SECRET", "dev-insecure-secret-change-me"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  isProd: (process.env.NODE_ENV ?? "development") === "production",
  /** Central BudgetSmart account API (source of truth for subscription tier). */
  centralApiUrl: process.env.CENTRAL_API_URL ?? "https://budgetsmart-api.budgetsmart.workers.dev",
} as const;
