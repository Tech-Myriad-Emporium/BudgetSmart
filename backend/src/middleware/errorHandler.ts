import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "../lib/http.js";

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "Route not found" });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
    return;
  }
  // SQLite constraint violations and other unexpected errors surface here.
  const message = err instanceof Error ? err.message : "Internal server error";
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.error("[error]", err);
  }
  res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : message });
}
