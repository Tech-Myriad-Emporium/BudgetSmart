import type { Env } from "./types.js";

const enc = new TextEncoder();

/** Flatten a nested object into Stripe's bracket form-encoding. */
function encodeForm(obj: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const k = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object") {
      parts.push(encodeForm(value as Record<string, unknown>, k));
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

export async function stripe<T = any>(
  env: Env,
  path: string,
  method: "GET" | "POST" = "POST",
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body ? encodeForm(body) : undefined,
  });
  const data = (await res.json()) as any;
  if (!res.ok) {
    throw new Error(`Stripe ${method} ${path} failed: ${data?.error?.message ?? res.status}`);
  }
  return data as T;
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify a Stripe webhook signature (t=…,v1=… header) using the signing secret.
 * Returns true only when a v1 HMAC matches and the timestamp is within tolerance.
 */
export async function verifyStripeSignature(
  payload: string,
  sigHeader: string | null,
  secret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!sigHeader) return false;
  const fields = new Map<string, string>();
  for (const part of sigHeader.split(",")) {
    const [k, v] = part.split("=");
    if (k && v) fields.set(k.trim(), v.trim());
  }
  const t = fields.get("t");
  const v1 = fields.get("v1");
  if (!t || !v1) return false;

  if (Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > toleranceSeconds) return false;

  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`));
  return timingSafeEqualStr(hex(new Uint8Array(sig)), v1);
}
