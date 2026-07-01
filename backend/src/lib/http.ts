import type { NextFunction, Request, Response } from "express";

/** A controlled error that maps to an HTTP status + JSON body. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, message, details);
  }
  static unauthorized(message = "Not authenticated") {
    return new ApiError(401, message);
  }
  static forbidden(message = "Not allowed") {
    return new ApiError(403, message);
  }
  static notFound(message = "Not found") {
    return new ApiError(404, message);
  }
  static conflict(message: string) {
    return new ApiError(409, message);
  }
}

/** Read a route param as a string (Express 5 types params as a loose union). */
export const routeParam = (req: Request, name: string): string => {
  const v = req.params[name];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
};

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** Wrap an async route so thrown/rejected errors reach the error middleware. */
export const asyncHandler =
  (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);
