import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { users } from "../../db/repo.js";
import { ApiError, asyncHandler } from "../../lib/http.js";
import { serializeUser } from "../../lib/serialize.js";
import { signToken } from "../../lib/token.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";
import { seedDefaultsForUser } from "../categories/defaults.js";

const registerSchema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase().trim()),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(80).default("There"),
  currency: z.string().length(3).default("USD"),
});

const loginSchema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase().trim()),
  password: z.string().min(1),
});

export const authRouter = Router();

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { email, password, name, currency } = registerSchema.parse(req.body);

    if (users.findByEmail(email)) throw ApiError.conflict("An account with that email already exists");

    const passwordHash = await bcrypt.hash(password, 10);
    const user = users.create({ email, passwordHash, name, currency });

    // Give every new user a sensible starter set of categories.
    seedDefaultsForUser(user.id);

    const token = signToken({ sub: user.id, email: user.email });
    res.status(201).json({ token, user: serializeUser(user) });
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    const user = users.findByEmail(email);
    if (!user) throw ApiError.unauthorized("Invalid email or password");

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw ApiError.unauthorized("Invalid email or password");

    const token = signToken({ sub: user.id, email: user.email });
    res.json({ token, user: serializeUser(user) });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = users.findById(userIdOf(req));
    if (!user) throw ApiError.unauthorized();
    res.json({ user: serializeUser(user) });
  }),
);

/** POST /auth/onboarded — mark the in-app tour as completed. */
authRouter.post(
  "/onboarded",
  requireAuth,
  asyncHandler(async (req, res) => {
    users.markOnboarded(userIdOf(req));
    const user = users.findById(userIdOf(req))!;
    res.json({ user: serializeUser(user) });
  }),
);
