import jwt from "jsonwebtoken";
import { env } from "../env.js";

export interface TokenPayload {
  sub: string; // userId
  email: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.jwtSecret);
  if (typeof decoded === "string" || !decoded.sub) {
    throw new Error("Invalid token payload");
  }
  return { sub: String(decoded.sub), email: String((decoded as jwt.JwtPayload).email ?? "") };
}
