import { Hono } from "hono";
import { cors } from "hono/cors";
import { sign, verify } from "hono/jwt";
import { hashPassword, verifyPassword, randomToken, newId } from "./crypto.js";
import {
  sendVerificationEmail,
  sendFamilyInviteEmail,
  sendMonthlyDigestEmail,
  sendOrderReceiptEmail,
  sendRedemptionCodeEmail,
  type DigestPayload,
} from "./email.js";
import { stripe, verifyStripeSignature } from "./stripe.js";
import { isInterval, isValidTier, priceIdForTier, tierForPriceId } from "./tiers.js";
import { quoteOrder, planFeatureLabel, MIN_CUSTOM_SEATS, MIN_ENTERPRISE_SEATS } from "./plans.js";
import {
  SECURITY_HEADERS, HONEYPOT_PATHS, clientIp, clientCountry, ipHash,
  logSec, buildEvidenceReport, checkRateLimit, isIpBlocked, blockIpHash, isLockedDown,
  loginLockedUntil, recordLoginFail, clearLoginFails, noteUserCountry,
  getConfig, setConfig, encryptField, decryptField,
} from "./security.js";
import { generateSecret, verifyTotp, otpauthUri } from "./totp.js";
import { CORE_SYMBOLS, getHistory, getQuotes, refreshMarket, toProviderSymbol } from "./market.js";
import type { AccountView, Env, UserRow } from "./types.js";

type Vars = { userId: string; ip: string; country: string };
const app = new Hono<{ Bindings: Env; Variables: Vars }>();

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const VERIFY_TTL_SECONDS = 60 * 60 * 24; // 24h

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */
const now = () => new Date().toISOString();
const unix = () => Math.floor(Date.now() / 1000);
const normEmail = (e: string) => e.trim().toLowerCase();

function view(u: UserRow, env: Env): AccountView {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    emailVerified: u.email_verified === 1,
    tier: u.tier,
    subscriptionStatus: u.subscription_status,
    currentPeriodEnd: u.current_period_end,
    birthday: u.birthday ?? null,
    avatarUrl: u.avatar_key ? `${env.API_ORIGIN}/avatar/${u.id}?v=${encodeURIComponent(u.updated_at)}` : null,
    locale: u.locale ?? "en",
    theme: u.theme ?? "dark",
    location: u.location ?? null,
    twoFactorEnabled: u.totp_enabled === 1,
    trialEndsAt: u.trial_ends_at ?? null,
  };
}

/** A non-owner family member inherits the owner's family tier while the owner's
 *  subscription is live. Owners (and everyone else) keep their own tier. */
async function familyTierFor(env: Env, userId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT o.tier AS tier, o.subscription_status AS status
       FROM family_members m
       JOIN families f ON f.id = m.family_id
       JOIN users o ON o.id = f.owner_id
      WHERE m.user_id = ? AND m.role = 'member'
      LIMIT 1`,
  ).bind(userId).first<{ tier: string; status: string | null }>();
  if (row && row.tier.startsWith("fam_") && (row.status === "active" || row.status === "trialing")) return row.tier;
  return null;
}

/** Free trial: Tier 3 for 7 days, no card. Active while the clock runs. */
const TRIAL_DAYS = 7;
const TRIAL_TIER = "ind_t3";
function trialActive(u: UserRow): boolean {
  return u.tier === "base" && !!u.trial_ends_at && u.trial_ends_at > unix();
}

/** Effective tier = inherited family tier if any, else trial, else their own. */
async function resolveTier(env: Env, u: UserRow): Promise<string> {
  if (u.tier.startsWith("fam_")) return u.tier; // owner already has it
  const fam = await familyTierFor(env, u.id);
  if (fam) return fam;
  if (trialActive(u)) return TRIAL_TIER;
  return u.tier;
}

/** Client-facing account view with the effective (possibly inherited) tier. */
async function accountView(env: Env, u: UserRow): Promise<AccountView> {
  return { ...view(u, env), tier: await resolveTier(env, u), trialEndsAt: u.trial_ends_at ?? null };
}

const getUserByEmail = (env: Env, email: string) =>
  env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<UserRow>();
const getUserById = (env: Env, id: string) =>
  env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
const getUserByCustomer = (env: Env, customerId: string) =>
  env.DB.prepare("SELECT * FROM users WHERE stripe_customer_id = ?").bind(customerId).first<UserRow>();

async function issueToken(env: Env, u: UserRow): Promise<string> {
  return sign({ sub: u.id, email: u.email, exp: unix() + TOKEN_TTL_SECONDS }, env.JWT_SECRET, "HS256");
}

/** Bearer-JWT auth middleware. */
async function auth(c: any, next: () => Promise<void>) {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) return c.json({ error: "Missing token" }, 401);
  try {
    const payload = await verify(header.slice(7).trim(), c.env.JWT_SECRET, "HS256");
    // A "2FA pending" challenge token is not a real session — reject it here.
    if ((payload as any).twofa === "pending") return c.json({ error: "Two-factor step not completed" }, 401);
    c.set("userId", String(payload.sub));
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
}

/* ------------------------------------------------------------------ *
 * Signed entitlement tokens (RS256). The app embeds the public key and
 * verifies these, so a tier can't be forged by editing the local DB.
 * ------------------------------------------------------------------ */
const ENTITLEMENT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7-day offline grace
let entKeyPromise: Promise<CryptoKey> | null = null;
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
function entPrivateKey(env: Env): Promise<CryptoKey> {
  if (!entKeyPromise) {
    entKeyPromise = crypto.subtle.importKey("pkcs8", pemToArrayBuffer(env.ENTITLEMENT_PRIVATE_KEY), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  }
  return entKeyPromise;
}
async function signEntitlement(env: Env, userId: string, tier: string): Promise<string> {
  const key = await entPrivateKey(env);
  const iat = unix();
  return sign({ sub: userId, tier, typ: "entitlement", iat, exp: iat + ENTITLEMENT_TTL_SECONDS }, key, "RS256");
}

/* ------------------------------------------------------------------ *
 * CORS — allow the marketing site (browser). The desktop app calls this
 * from its local backend (server-side, no Origin), which is unaffected.
 * ------------------------------------------------------------------ */
app.use(
  "*",
  cors({
    origin: (origin) =>
      !origin || /^https:\/\/(www\.)?budgetsmarttme\.com$/.test(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin)
        ? origin || "*"
        : "",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-upload-token"],
    maxAge: 86400,
  }),
);

/* ------------------------------------------------------------------ *
 * Security perimeter middleware (see security.ts):
 *  - stamps client IP + country on the context,
 *  - hardens every response with security headers,
 *  - honours the global lockdown kill-switch on mutating requests,
 *  - blocks IPs that have tripped a honeypot or been blocked by an admin.
 * Reads stay fast: the IP-block/lockdown checks only run on mutating
 * requests (POST/PUT/DELETE/PATCH), and lockdown state is isolate-cached.
 * ------------------------------------------------------------------ */
app.use("*", async (c, next) => {
  const ip = clientIp(c);
  const country = clientCountry(c);
  c.set("ip", ip);
  c.set("country", country);

  const mutating = c.req.method !== "GET" && c.req.method !== "OPTIONS" && c.req.method !== "HEAD";
  if (mutating) {
    // Lockdown: an operator can freeze all writes instantly during an incident.
    // Admin security + billing-webhook paths stay reachable so we can recover.
    const path = c.req.path;
    const exempt = path.startsWith("/admin/") || path === "/webhooks/stripe";
    if (!exempt && (await isLockedDown(c.env))) {
      return c.json({ error: "Service is temporarily in maintenance/lockdown. Please try again shortly." }, 503);
    }
    const ipH = await ipHash(c.env, ip);
    if (await isIpBlocked(c.env, ipH)) {
      await logSec(c, { severity: "warn", type: "blocked_ip_hit", ip, country, path });
      return c.json({ error: "Forbidden" }, 403);
    }
  }

  await next();

  for (const [k, v] of Object.entries(SECURITY_HEADERS)) c.res.headers.set(k, v);
  c.res.headers.delete("x-powered-by");
});

/* Honeypots: no real client hits these. A request is a scanner/attacker —
 * log it, block the source for 24h, and return a bland 404. */
async function honeypot(c: any) {
  const ip = clientIp(c);
  const country = clientCountry(c);
  const ipH = await ipHash(c.env, ip);
  await blockIpHash(c.env, ipH, `honeypot:${c.req.path}`, 24 * 3600);
  await logSec(c, { severity: "high", type: "honeypot", ip, country, path: c.req.path, detail: { method: c.req.method } });
  return c.json({ error: "Not found" }, 404);
}
for (const p of HONEYPOT_PATHS) app.all(p, honeypot);

app.get("/", (c) => c.json({ service: "budgetsmart-api", status: "ok", time: now() }));
app.get("/health", (c) => c.json({ status: "ok" }));

/* ------------------------------------------------------------------ *
 * Release channel — installed apps poll this to learn about updates.
 * Bump LATEST on each release (keep in sync with shared APP_VERSION).
 * ------------------------------------------------------------------ */
const LATEST = {
  version: "1.2.3",
  channel: "beta",
  label: "Beta v1.2.3",
  notes: "macOS support, investment backtesting on real market history, and on-device receipt scanning (photo → transaction).",
  windows: "https://budgetsmart-api.budgetsmart.workers.dev/download/BudgetSmart-Setup.exe",
  mac: "https://budgetsmart-api.budgetsmart.workers.dev/download/BudgetSmart-arm64.dmg",
  macIntel: "https://budgetsmart-api.budgetsmart.workers.dev/download/BudgetSmart-x64.dmg",
  linux: "https://budgetsmart-api.budgetsmart.workers.dev/download/BudgetSmart.AppImage",
  android: "https://budgetsmart-api.budgetsmart.workers.dev/download/BudgetSmart.apk",
  ios: "https://budgetsmart-api.budgetsmart.workers.dev/download/BudgetSmart.ipa",
};
app.get("/version", (c) => c.json(LATEST));

/* ------------------------------------------------------------------ *
 * Admin security surface (guarded by the upload token). This is the
 * incident-response console: triage the event log, flip the lockdown
 * kill-switch, and block/unblock sources.
 * ------------------------------------------------------------------ */
app.get("/admin/security/status", async (c) => {
  if (!uploadAllowed(c)) return c.json({ error: "unauthorized" }, 401);
  const since = Date.now() - 24 * 3600 * 1000;
  const bySeverity = (
    await c.env.DB.prepare("SELECT severity, COUNT(*) AS n FROM security_events WHERE ts > ? GROUP BY severity").bind(since).all()
  ).results;
  const byType = (
    await c.env.DB.prepare("SELECT type, COUNT(*) AS n FROM security_events WHERE ts > ? GROUP BY type ORDER BY n DESC LIMIT 15").bind(since).all()
  ).results;
  const blocks = (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM ip_blocks WHERE until = 0 OR until > ?").bind(unix()).first<{ n: number }>())?.n ?? 0;
  return c.json({ lockdown: (await getConfig(c.env, "lockdown")) === "1", last24h: { bySeverity, byType }, activeIpBlocks: blocks });
});

app.get("/admin/security/events", async (c) => {
  if (!uploadAllowed(c)) return c.json({ error: "unauthorized" }, 401);
  const sev = c.req.query("severity");
  const limit = Math.min(500, Math.max(1, Number(c.req.query("limit")) || 100));
  const rows = sev
    ? (await c.env.DB.prepare("SELECT * FROM security_events WHERE severity = ? ORDER BY ts DESC LIMIT ?").bind(sev, limit).all()).results
    : (await c.env.DB.prepare("SELECT * FROM security_events ORDER BY ts DESC LIMIT ?").bind(limit).all()).results;
  return c.json({ events: rows });
});

app.post("/admin/security/lockdown", async (c) => {
  if (!uploadAllowed(c)) return c.json({ error: "unauthorized" }, 401);
  const on = !!(await c.req.json().catch(() => ({}))).on;
  await setConfig(c.env, "lockdown", on ? "1" : "0");
  await logSec(c, { severity: "critical", type: on ? "lockdown_on" : "lockdown_off", ip: c.get("ip"), country: c.get("country"), path: "/admin/security/lockdown" });
  return c.json({ ok: true, lockdown: on });
});

app.post("/admin/security/block", async (c) => {
  if (!uploadAllowed(c)) return c.json({ error: "unauthorized" }, 401);
  const b = await c.req.json().catch(() => ({}));
  const ip = String(b.ip ?? "").trim();
  if (!ip) return c.json({ error: "Pass an ip" }, 400);
  const seconds = Math.max(0, Math.floor(Number(b.seconds) || 0)); // 0 = permanent
  await blockIpHash(c.env, await ipHash(c.env, ip), String(b.reason ?? "manual"), seconds);
  await logSec(c, { severity: "warn", type: "manual_block", path: "/admin/security/block", detail: { seconds } });
  return c.json({ ok: true });
});

/** Law-enforcement-forwardable evidence report: source IPs, ISP/ASN, geo,
 *  targeted accounts and timestamps. `?format=text` returns a paste-ready
 *  report; default JSON. `?days=` window (default 7, max 90). */
app.get("/admin/security/report", async (c) => {
  if (!uploadAllowed(c)) return c.json({ error: "unauthorized" }, 401);
  const days = Math.min(90, Math.max(1, Number(c.req.query("days")) || 7));
  const { json, text } = await buildEvidenceReport(c.env, days);
  if (c.req.query("format") === "text") {
    return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return c.json(json as Record<string, unknown>);
});

// Installer uploads through the R2 binding (multipart), guarded by a secret
// token. R2's public/S3 side is inconsistent on this account, so installers are
// written via the binding and served by /download below.
function uploadAllowed(c: any): boolean {
  return !!c.env.UPLOAD_TOKEN && c.req.header("x-upload-token") === c.env.UPLOAD_TOKEN;
}
app.post("/admin/mpu/start", async (c) => {
  if (!uploadAllowed(c)) return c.json({ error: "unauthorized" }, 401);
  const mpu = await c.env.DOWNLOADS.createMultipartUpload(c.req.query("key")!);
  return c.json({ uploadId: mpu.uploadId, key: mpu.key });
});
app.put("/admin/mpu/part", async (c) => {
  if (!uploadAllowed(c)) return c.json({ error: "unauthorized" }, 401);
  const mpu = c.env.DOWNLOADS.resumeMultipartUpload(c.req.query("key")!, c.req.query("uploadId")!);
  const uploaded = await mpu.uploadPart(Number(c.req.query("part")), await c.req.arrayBuffer());
  return c.json({ partNumber: uploaded.partNumber, etag: uploaded.etag });
});
app.post("/admin/mpu/complete", async (c) => {
  if (!uploadAllowed(c)) return c.json({ error: "unauthorized" }, 401);
  const { key, uploadId, parts } = await c.req.json();
  const mpu = c.env.DOWNLOADS.resumeMultipartUpload(key, uploadId);
  const obj = await mpu.complete(parts);
  return c.json({ ok: true, size: obj.size, etag: obj.httpEtag });
});

// Public download of app installers, streamed from R2 via the binding.
app.get("/download/:file", async (c) => {
  const key = c.req.param("file");
  const rangeHeader = c.req.header("range");

  let options: R2GetOptions | undefined;
  if (rangeHeader) {
    const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : undefined;
      const end = m[2] ? parseInt(m[2], 10) : undefined;
      if (start !== undefined && end !== undefined) options = { range: { offset: start, length: end - start + 1 } };
      else if (start !== undefined) options = { range: { offset: start } };
      else if (end !== undefined) options = { range: { suffix: end } };
    }
  }

  const obj = await c.env.DOWNLOADS.get(key, options);
  if (!obj) return c.json({ error: "Not found" }, 404);

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "public, max-age=3600");
  headers.set("Content-Disposition", `attachment; filename="${key}"`);
  if (!headers.get("Content-Type")) headers.set("Content-Type", "application/octet-stream");

  if (rangeHeader && obj.range) {
    const offset = "offset" in obj.range ? obj.range.offset ?? 0 : obj.size - (("suffix" in obj.range && obj.range.suffix) || 0);
    const length = "length" in obj.range && obj.range.length !== undefined ? obj.range.length : obj.size - offset;
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set("Content-Length", String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(obj.size));
  return new Response(obj.body, { status: 200, headers });
});

/* ------------------------------------------------------------------ *
 * Auth
 * ------------------------------------------------------------------ */
app.post("/auth/register", async (c) => {
  const ip = c.get("ip");
  // Cap new-account creation per IP so nobody can script thousands of accounts.
  const rl = await checkRateLimit(c.env, `register:${await ipHash(c.env, ip)}`, 8, 3600);
  if (!rl.ok) {
    await logSec(c, { severity: "warn", type: "ratelimit", ip, country: c.get("country"), path: "/auth/register" });
    c.res.headers.set("Retry-After", String(rl.retryAfter));
    return c.json({ error: "Too many attempts — please wait a bit and try again." }, 429);
  }
  const body = await c.req.json().catch(() => ({}));
  const email = normEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim().slice(0, 120);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: "Enter a valid email" }, 400);
  if (password.length < 8) return c.json({ error: "Password must be at least 8 characters" }, 400);

  const existing = await getUserByEmail(c.env, email);
  if (existing) {
    // Don't reveal much; if unverified, resend the link.
    if (existing.email_verified === 0) await createAndSendVerification(c.env, existing);
    return c.json({ ok: true, needsVerification: true });
  }

  const user: UserRow = {
    id: newId(),
    email,
    password_hash: await hashPassword(password),
    trial_ends_at: null,
    name,
    email_verified: 0,
    tier: "base",
    stripe_customer_id: null,
    subscription_id: null,
    subscription_status: null,
    current_period_end: null,
    created_at: now(),
    updated_at: now(),
    birthday: null,
    avatar_key: null,
    locale: "en",
    theme: "dark",
    location: null,
    totp_secret: null,
    totp_enabled: 0,
    google_sub: null,
  };
  await c.env.DB.prepare(
    "INSERT INTO users (id,email,password_hash,name,email_verified,tier,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
  )
    .bind(user.id, user.email, user.password_hash, user.name, 0, "base", user.created_at, user.updated_at)
    .run();

  // new accounts start with a 7-day Tier 3 trial — no card needed
  await c.env.DB.prepare("UPDATE users SET trial_ends_at = ? WHERE id = ?").bind(unix() + TRIAL_DAYS * 86_400, user.id).run();
  await createAndSendVerification(c.env, user);
  await notify(c.env, user.id, "welcome", "Welcome to BudgetSmart 🎉", `Your account is ready — and your ${TRIAL_DAYS}-day Tier 3 free trial is already running. Verify your email, then connect the app.`);
  return c.json({ ok: true, needsVerification: true });
});

async function createAndSendVerification(env: Env, user: UserRow) {
  const token = randomToken();
  await env.DB.prepare("INSERT INTO email_tokens (token,user_id,purpose,expires_at,created_at) VALUES (?,?,?,?,?)")
    .bind(token, user.id, "verify", unix() + VERIFY_TTL_SECONDS, now())
    .run();
  // The verification link points back at this API's /auth/verify, which then
  // redirects the browser to the marketing site.
  const verifyUrl = `${env.API_ORIGIN}/auth/verify?token=${token}`;
  await sendVerificationEmail(env, user.email, user.name, verifyUrl);
}

app.get("/auth/verify", async (c) => {
  const token = c.req.query("token") ?? "";
  const row = await c.env.DB.prepare("SELECT * FROM email_tokens WHERE token = ? AND purpose = 'verify'").bind(token).first<{
    user_id: string;
    expires_at: number;
  }>();
  const site = new URL(c.env.APP_URL).origin;
  if (!row || row.expires_at < unix()) return c.redirect(`${site}/verified?ok=0`, 302);
  await c.env.DB.prepare("UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?").bind(now(), row.user_id).run();
  await c.env.DB.prepare("DELETE FROM email_tokens WHERE token = ?").bind(token).run();
  return c.redirect(`${site}/verified?ok=1`, 302);
});

app.post("/auth/resend", async (c) => {
  // Cap resends per IP so nobody can weaponize us to email-bomb an address.
  const rl = await checkRateLimit(c.env, `resend:${await ipHash(c.env, c.get("ip"))}`, 5, 3600);
  if (!rl.ok) { c.res.headers.set("Retry-After", String(rl.retryAfter)); return c.json({ ok: true }); }
  const body = await c.req.json().catch(() => ({}));
  const email = normEmail(String(body.email ?? ""));
  const user = await getUserByEmail(c.env, email);
  if (user && user.email_verified === 0) await createAndSendVerification(c.env, user);
  return c.json({ ok: true }); // always ok (don't leak existence)
});

app.post("/auth/login", async (c) => {
  const ip = c.get("ip");
  const country = c.get("country");
  const body = await c.req.json().catch(() => ({}));
  const email = normEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");

  // Brute-force controls: per-IP rate limit + per-(email,ip) escalating lockout.
  const rl = await checkRateLimit(c.env, `login:${await ipHash(c.env, ip)}`, 20, 900);
  if (!rl.ok) {
    await logSec(c, { severity: "high", type: "ratelimit", ip, country, path: "/auth/login", detail: { email } });
    c.res.headers.set("Retry-After", String(rl.retryAfter));
    return c.json({ error: "Too many sign-in attempts — please wait and try again." }, 429);
  }
  const lockKey = `${email}|${await ipHash(c.env, ip)}`;
  const lockedUntil = await loginLockedUntil(c.env, lockKey);
  if (lockedUntil) {
    return c.json({ error: "This account is temporarily locked after too many failed attempts. Try again later or reset your password." }, 429);
  }

  const user = await getUserByEmail(c.env, email);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    const { fails, lockedUntil: lu } = await recordLoginFail(c.env, lockKey);
    await logSec(c, {
      severity: lu ? "high" : "info",
      type: lu ? "lockout" : "login_fail",
      ip, country, userId: user?.id ?? null, path: "/auth/login", detail: { email, fails },
    });
    return c.json({ error: "Incorrect email or password" }, 401);
  }
  await clearLoginFails(c.env, lockKey);

  if (user.email_verified === 0) {
    await createAndSendVerification(c.env, user);
    return c.json({ error: "Please verify your email — we've sent a new link.", code: "email_unverified" }, 403);
  }
  if (user.totp_enabled === 1) {
    // Password OK, but the account is protected by an authenticator — issue a
    // short-lived challenge the client redeems at /auth/2fa/verify with a code.
    const challenge = await sign({ sub: user.id, twofa: "pending", exp: unix() + 300 }, c.env.JWT_SECRET, "HS256");
    return c.json({ twoFactor: true, challenge });
  }
  // Geo-velocity anomaly: alert on first successful login from a new country.
  const geo = await noteUserCountry(c.env, user.id, country);
  if (geo.isNew) {
    await logSec(c, { severity: "critical", type: "new_country_login", ip, country, userId: user.id, path: "/auth/login", detail: { email } });
    await notify(c.env, user.id, "security", "New sign-in location", `Your account was accessed from a new country (${country}). If this wasn't you, change your password and enable two-factor.`);
  }
  const token = await issueToken(c.env, user);
  return c.json({ token, account: await accountView(c.env, user) });
});

/** Redeem a 2FA challenge with a 6-digit authenticator code for a real session. */
app.post("/auth/2fa/verify", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  let payload: any;
  try {
    payload = await verify(String(body.challenge ?? ""), c.env.JWT_SECRET, "HS256");
  } catch {
    return c.json({ error: "That took too long — please sign in again." }, 401);
  }
  if (payload.twofa !== "pending") return c.json({ error: "Invalid challenge" }, 400);
  const user = await getUserById(c.env, String(payload.sub));
  if (!user || user.totp_enabled !== 1 || !user.totp_secret) return c.json({ error: "Two-factor isn't enabled" }, 400);
  // Throttle TOTP guesses on a valid challenge (6-digit codes are brute-forceable).
  const rl = await checkRateLimit(c.env, `2fa:${user.id}`, 10, 300);
  if (!rl.ok) {
    await logSec(c, { severity: "high", type: "2fa_bruteforce", ip: c.get("ip"), country: c.get("country"), userId: user.id, path: "/auth/2fa/verify" });
    return c.json({ error: "Too many codes — wait a few minutes and sign in again." }, 429);
  }
  const totpSecret = await decryptField(c.env, user.totp_secret);
  if (!totpSecret || !(await verifyTotp(totpSecret, String(body.code ?? "")))) {
    await logSec(c, { severity: "info", type: "2fa_fail", ip: c.get("ip"), country: c.get("country"), userId: user.id, path: "/auth/2fa/verify" });
    return c.json({ error: "Incorrect code — check your authenticator app" }, 401);
  }
  const geo = await noteUserCountry(c.env, user.id, c.get("country"));
  if (geo.isNew) {
    await logSec(c, { severity: "critical", type: "new_country_login", ip: c.get("ip"), country: c.get("country"), userId: user.id, path: "/auth/2fa/verify" });
  }
  const token = await issueToken(c.env, user);
  return c.json({ token, account: await accountView(c.env, user) });
});

/* ------------------------------------------------------------------ *
 * Sign in with Google (OAuth 2.0 authorization-code flow)
 * ------------------------------------------------------------------ */
function decodeJwtPayload(jwt: string): any {
  let seg = jwt.split(".")[1] ?? "";
  seg = seg.replace(/-/g, "+").replace(/_/g, "/");
  while (seg.length % 4) seg += "=";
  return JSON.parse(atob(seg));
}
const googleRedirect = (env: Env) => `${env.API_ORIGIN}/auth/google/callback`;

app.get("/auth/google/start", async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) return c.json({ error: "Google sign-in isn't configured" }, 503);
  const state = await sign({ n: randomToken(12), exp: unix() + 600 }, c.env.JWT_SECRET, "HS256");
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirect(c.env),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, 302);
});

app.get("/auth/google/callback", async (c) => {
  const site = new URL(c.env.APP_URL).origin;
  const fail = (why: string) => c.redirect(`${site}/account?oauth=${why}`, 302);
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return fail("error");
  try { await verify(state, c.env.JWT_SECRET, "HS256"); } catch { return fail("error"); }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID!,
      client_secret: c.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleRedirect(c.env),
      grant_type: "authorization_code",
    }).toString(),
  });
  const tokens = (await tokenRes.json().catch(() => ({}))) as any;
  if (!tokenRes.ok || !tokens.id_token) return fail("error");

  const p = decodeJwtPayload(tokens.id_token);
  const email = String(p.email ?? "").toLowerCase().trim();
  const sub = String(p.sub ?? "");
  const name = String(p.name ?? "There").slice(0, 80);
  if (!email || !sub) return fail("error");

  let user = await getUserByEmail(c.env, email);
  if (!user) {
    const id = newId();
    await c.env.DB.prepare(
      "INSERT INTO users (id,email,password_hash,name,email_verified,tier,created_at,updated_at,locale,theme,totp_enabled,google_sub) VALUES (?,?,?,?,1,'base',?,?,'en','dark',0,?)",
    ).bind(id, email, "oauth:google", name, now(), now(), sub).run();
    user = await getUserById(c.env, id);
    await notify(c.env, id, "welcome", "Welcome to BudgetSmart 🎉", "You're signed in with Google. Choose a plan and connect the app.");
  } else {
    await c.env.DB.prepare("UPDATE users SET email_verified = 1, google_sub = ?, updated_at = ? WHERE id = ?").bind(sub, now(), user.id).run();
    user = await getUserById(c.env, user.id);
  }
  const token = await issueToken(c.env, user!);
  return c.redirect(`${site}/account#token=${token}`, 302);
});

app.get("/me", auth, async (c) => {
  const user = await getUserById(c.env, c.get("userId"));
  if (!user) return c.json({ error: "Not found" }, 404);
  return c.json({ account: await accountView(c.env, user) });
});

/** Update editable profile fields (name, birthday, location, locale, theme). */
app.post("/account/profile", auth, async (c) => {
  const user = await getUserById(c.env, c.get("userId"));
  if (!user) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const sets: string[] = [];
  const vals: unknown[] = [];
  const put = (col: string, val: unknown, max = 200) => {
    if (typeof val === "string") { sets.push(`${col} = ?`); vals.push(val.trim().slice(0, max)); }
  };
  put("name", body.name, 80);
  put("birthday", body.birthday, 10);
  put("location", body.location, 120);
  put("locale", body.locale, 10);
  put("theme", body.theme, 10);
  if (sets.length) {
    sets.push("updated_at = ?");
    vals.push(now(), user.id);
    await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  }
  const updated = await getUserById(c.env, user.id);
  return c.json({ account: await accountView(c.env, updated!) });
});

/** Upload a profile picture (PNG/JPEG/WebP data URL, ≤2MB) → R2. */
app.post("/account/avatar", auth, async (c) => {
  const user = await getUserById(c.env, c.get("userId"));
  if (!user) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const m = String(body.data ?? "").match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/);
  if (!m) return c.json({ error: "Send a PNG, JPEG or WebP image" }, 400);
  const bytes = Uint8Array.from(atob(m[2]!), (ch) => ch.charCodeAt(0));
  if (bytes.length > 2_000_000) return c.json({ error: "Image too large (max 2MB)" }, 400);
  await c.env.DOWNLOADS.put(`avatars/${user.id}`, bytes, { httpMetadata: { contentType: m[1] } });
  await c.env.DB.prepare("UPDATE users SET avatar_key = ?, updated_at = ? WHERE id = ?").bind(`avatars/${user.id}`, now(), user.id).run();
  const updated = await getUserById(c.env, user.id);
  return c.json({ account: await accountView(c.env, updated!) });
});

/* ------------------------------------------------------------------ *
 * Two-factor authentication (TOTP authenticator apps)
 * ------------------------------------------------------------------ */
/** Begin setup: mint a secret (not yet active) and return it + an otpauth URI. */
app.post("/account/2fa/setup", auth, async (c) => {
  const user = await getUserById(c.env, c.get("userId"));
  if (!user) return c.json({ error: "Not found" }, 404);
  if (user.totp_enabled === 1) return c.json({ error: "Two-factor is already on" }, 400);
  const secret = generateSecret();
  // Stored encrypted at rest (field-level AES-GCM); the plaintext is only
  // returned once here so the user can add it to their authenticator.
  await c.env.DB.prepare("UPDATE users SET totp_secret = ?, updated_at = ? WHERE id = ?").bind(await encryptField(c.env, secret), now(), user.id).run();
  return c.json({ secret, otpauth: otpauthUri(user.email, secret) });
});

/** Confirm setup: verify a code against the pending secret, then activate. */
app.post("/account/2fa/enable", auth, async (c) => {
  const user = await getUserById(c.env, c.get("userId"));
  if (!user) return c.json({ error: "Not found" }, 404);
  if (!user.totp_secret) return c.json({ error: "Start setup first" }, 400);
  const code = String((await c.req.json().catch(() => ({}))).code ?? "");
  const setupSecret = await decryptField(c.env, user.totp_secret);
  if (!setupSecret || !(await verifyTotp(setupSecret, code))) return c.json({ error: "That code didn't match — check your authenticator" }, 400);
  await c.env.DB.prepare("UPDATE users SET totp_enabled = 1, updated_at = ? WHERE id = ?").bind(now(), user.id).run();
  await notify(c.env, user.id, "security", "Two-factor authentication enabled", "Your account now asks for a 6-digit code when you sign in.");
  const updated = await getUserById(c.env, user.id);
  return c.json({ account: await accountView(c.env, updated!) });
});

/** Turn 2FA off — requires a current code so a hijacked session can't disable it. */
app.post("/account/2fa/disable", auth, async (c) => {
  const user = await getUserById(c.env, c.get("userId"));
  if (!user) return c.json({ error: "Not found" }, 404);
  const code = String((await c.req.json().catch(() => ({}))).code ?? "");
  const disableSecret = user.totp_secret ? await decryptField(c.env, user.totp_secret) : null;
  if (user.totp_enabled === 1 && disableSecret && !(await verifyTotp(disableSecret, code))) {
    return c.json({ error: "Enter a current code to turn 2FA off" }, 400);
  }
  await c.env.DB.prepare("UPDATE users SET totp_enabled = 0, totp_secret = NULL, updated_at = ? WHERE id = ?").bind(now(), user.id).run();
  await notify(c.env, user.id, "security", "Two-factor authentication disabled", "2FA is no longer required when you sign in.");
  const updated = await getUserById(c.env, user.id);
  return c.json({ account: await accountView(c.env, updated!) });
});

/** Public avatar image. */
app.get("/avatar/:userId", async (c) => {
  const obj = await c.env.DOWNLOADS.get(`avatars/${c.req.param("userId")}`);
  if (!obj) return c.json({ error: "Not found" }, 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=300");
  if (!headers.get("Content-Type")) headers.set("Content-Type", "image/png");
  return new Response(obj.body, { status: 200, headers });
});

/* ------------------------------------------------------------------ *
 * Notifications
 * ------------------------------------------------------------------ */
async function notify(env: Env, userId: string, type: string, title: string, body?: string): Promise<void> {
  await env.DB.prepare("INSERT INTO notifications (id,user_id,type,title,body,read,created_at) VALUES (?,?,?,?,?,0,?)")
    .bind(newId(), userId, type, title, body ?? null, now())
    .run();
}

app.get("/notifications", auth, async (c) => {
  const rows = (
    await c.env.DB.prepare("SELECT id,type,title,body,read,created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50")
      .bind(c.get("userId"))
      .all<{ read: number }>()
  ).results;
  return c.json({ notifications: rows, unread: rows.filter((r) => r.read === 0).length });
});

app.post("/notifications/read-all", auth, async (c) => {
  await c.env.DB.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?").bind(c.get("userId")).run();
  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Family plans — the owner of a fam_* subscription shares it with up
 * to FAMILY_SIZE people (owner included) via emailed invites.
 * ------------------------------------------------------------------ */
const FAMILY_SIZE = 5; // default seat cap for a fam_* tier group
const INVITE_TTL_SECONDS = 60 * 60 * 24 * 14; // invites last 14 days

interface FamilyRow { id: string; owner_id: string; created_at: string }
interface InviteRow { id: string; token: string; family_id: string; from_user_id: string; to_email: string; status: string; created_at: string; expires_at: number }

const familyByOwner = (env: Env, ownerId: string) =>
  env.DB.prepare("SELECT * FROM families WHERE owner_id = ?").bind(ownerId).first<FamilyRow>();
const familyOfMember = (env: Env, userId: string) =>
  env.DB.prepare("SELECT f.* FROM families f JOIN family_members m ON m.family_id = f.id WHERE m.user_id = ?").bind(userId).first<FamilyRow>();

/** Seat cap for a family. Default FAMILY_SIZE (5); code-redeemed teams raise it
 *  via the family_seat_limits companion table. */
async function familySeatLimit(env: Env, familyId: string): Promise<number> {
  const row = await env.DB.prepare("SELECT seat_limit FROM family_seat_limits WHERE family_id = ?").bind(familyId).first<{ seat_limit: number }>();
  return row?.seat_limit ?? FAMILY_SIZE;
}
async function setFamilySeatLimit(env: Env, familyId: string, seats: number): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO family_seat_limits (family_id, seat_limit) VALUES (?,?) ON CONFLICT(family_id) DO UPDATE SET seat_limit = MAX(seat_limit, excluded.seat_limit)",
  ).bind(familyId, seats).run();
}

async function familySnapshot(env: Env, fam: FamilyRow, forOwner: boolean) {
  const members = (
    await env.DB.prepare(
      `SELECT u.id, u.name, u.email, u.avatar_key, m.role, m.joined_at
         FROM family_members m JOIN users u ON u.id = m.user_id
        WHERE m.family_id = ? ORDER BY m.joined_at`,
    ).bind(fam.id).all<{ id: string; name: string; email: string; avatar_key: string | null; role: string; joined_at: string }>()
  ).results;
  const invites = forOwner
    ? (
        await env.DB.prepare(
          "SELECT id, to_email, created_at FROM family_invites WHERE family_id = ? AND status = 'pending' AND expires_at > ? ORDER BY created_at DESC",
        ).bind(fam.id, unix()).all<{ id: string; to_email: string; created_at: string }>()
      ).results
    : [];
  const seatLimit = await familySeatLimit(env, fam.id);
  return {
    id: fam.id,
    ownerId: fam.owner_id,
    seatLimit,
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      joinedAt: m.joined_at,
      avatarUrl: m.avatar_key ? `${env.API_ORIGIN}/avatar/${m.id}` : null,
    })),
    invites,
    seatsLeft: Math.max(0, seatLimit - members.length - invites.length),
  };
}

app.get("/family", auth, async (c) => {
  const user = await getUserById(c.env, c.get("userId"));
  if (!user) return c.json({ error: "Not found" }, 404);
  const canOwn = user.tier.startsWith("fam_");
  const fam = (await familyByOwner(c.env, user.id)) ?? (await familyOfMember(c.env, user.id));
  if (!fam) return c.json({ family: null, canOwn });
  return c.json({ family: await familySnapshot(c.env, fam, fam.owner_id === user.id), canOwn });
});

/** Owner invites someone by email; they get a link from the bot Gmail. */
app.post("/family/invite", auth, async (c) => {
  const user = await getUserById(c.env, c.get("userId"));
  if (!user) return c.json({ error: "Not found" }, 404);
  if (!user.tier.startsWith("fam_")) return c.json({ error: "Family invites need an active Family plan" }, 403);
  const email = normEmail(String((await c.req.json().catch(() => ({}))).email ?? ""));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: "Enter a valid email address" }, 400);
  if (email === user.email) return c.json({ error: "That's you — invite someone else 🙂" }, 400);

  // Create the family (with the owner as its first member) on first invite.
  let fam = await familyByOwner(c.env, user.id);
  if (!fam) {
    if (await familyOfMember(c.env, user.id)) return c.json({ error: "You're already in another family" }, 400);
    const id = newId();
    await c.env.DB.prepare("INSERT INTO families (id, owner_id, created_at) VALUES (?,?,?)").bind(id, user.id, now()).run();
    await c.env.DB.prepare("INSERT INTO family_members (family_id, user_id, role, joined_at) VALUES (?,?,'owner',?)").bind(id, user.id, now()).run();
    fam = await familyByOwner(c.env, user.id);
  }

  const snap = await familySnapshot(c.env, fam!, true);
  if (snap.seatsLeft <= 0) return c.json({ error: `Your plan covers ${snap.seatLimit} people — remove a member or revoke an invite first` }, 400);
  if (snap.members.some((m) => m.email === email)) return c.json({ error: "They're already in your family" }, 400);
  if (snap.invites.some((i) => i.to_email === email)) return c.json({ error: "They already have a pending invite" }, 400);
  const invited = await getUserByEmail(c.env, email);
  if (invited && (await familyOfMember(c.env, invited.id))) return c.json({ error: "They're already in a family" }, 400);

  const token = randomToken(24);
  await c.env.DB.prepare(
    "INSERT INTO family_invites (id, token, family_id, from_user_id, to_email, status, created_at, expires_at) VALUES (?,?,?,?,?,'pending',?,?)",
  ).bind(newId(), token, fam!.id, user.id, email, now(), unix() + INVITE_TTL_SECONDS).run();

  const link = `${new URL(c.env.APP_URL).origin}/account?invite=${token}`;
  const sent = await sendFamilyInviteEmail(c.env, email, user.name || user.email, link);
  if (invited) {
    await notify(c.env, invited.id, "family", `${user.name || user.email} invited you to their family`, "Open the link in your invite email to accept.");
  }
  return c.json({ ok: true, sent, family: await familySnapshot(c.env, fam!, true) });
});

/** Invited person accepts (must be signed in with the invited email). */
app.post("/family/accept", auth, async (c) => {
  const user = await getUserById(c.env, c.get("userId"));
  if (!user) return c.json({ error: "Not found" }, 404);
  const token = String((await c.req.json().catch(() => ({}))).token ?? "");
  const inv = await c.env.DB.prepare("SELECT * FROM family_invites WHERE token = ?").bind(token).first<InviteRow>();
  if (!inv || inv.status !== "pending" || inv.expires_at < unix()) return c.json({ error: "This invite is no longer valid" }, 400);
  if (inv.to_email !== user.email) {
    return c.json({ error: `This invite was sent to ${inv.to_email} — sign in with that email to accept it` }, 403);
  }
  if (await familyOfMember(c.env, user.id)) return c.json({ error: "You're already in a family" }, 400);
  const fam = await c.env.DB.prepare("SELECT * FROM families WHERE id = ?").bind(inv.family_id).first<FamilyRow>();
  if (!fam) return c.json({ error: "This family no longer exists" }, 400);
  const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM family_members WHERE family_id = ?").bind(fam.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= (await familySeatLimit(c.env, fam.id))) return c.json({ error: "This plan is already full" }, 400);

  await c.env.DB.prepare("INSERT INTO family_members (family_id, user_id, role, joined_at) VALUES (?,?,'member',?)").bind(fam.id, user.id, now()).run();
  await c.env.DB.prepare("UPDATE family_invites SET status = 'accepted' WHERE id = ?").bind(inv.id).run();
  await notify(c.env, fam.owner_id, "family", `${user.name || user.email} joined your family`, "They now share your family plan.");
  await notify(c.env, user.id, "family", "Welcome to the family 🎉", "You share the family plan now. Reload the app to sync your new features.");
  return c.json({ ok: true, account: await accountView(c.env, user) });
});

/** Owner cancels a pending invite. */
app.post("/family/invite/revoke", auth, async (c) => {
  const user = await getUserById(c.env, c.get("userId"));
  const fam = user && (await familyByOwner(c.env, user.id));
  if (!fam) return c.json({ error: "Only the family owner can do that" }, 403);
  const id = String((await c.req.json().catch(() => ({}))).id ?? "");
  await c.env.DB.prepare("UPDATE family_invites SET status = 'revoked' WHERE id = ? AND family_id = ? AND status = 'pending'").bind(id, fam.id).run();
  return c.json({ ok: true, family: await familySnapshot(c.env, fam, true) });
});

/** Owner removes a member. */
app.post("/family/remove", auth, async (c) => {
  const user = await getUserById(c.env, c.get("userId"));
  const fam = user && (await familyByOwner(c.env, user.id));
  if (!fam) return c.json({ error: "Only the family owner can do that" }, 403);
  const memberId = String((await c.req.json().catch(() => ({}))).userId ?? "");
  if (memberId === user!.id) return c.json({ error: "You can't remove yourself — you own this family" }, 400);
  const res = await c.env.DB.prepare("DELETE FROM family_members WHERE family_id = ? AND user_id = ? AND role != 'owner'").bind(fam.id, memberId).run();
  if (res.meta.changes > 0) {
    await notify(c.env, memberId, "family", "You've been removed from a family plan", "Your account is back on its own plan.");
  }
  return c.json({ ok: true, family: await familySnapshot(c.env, fam, true) });
});

/** A member leaves on their own. */
app.post("/family/leave", auth, async (c) => {
  const user = await getUserById(c.env, c.get("userId"));
  if (!user) return c.json({ error: "Not found" }, 404);
  const fam = await familyOfMember(c.env, user.id);
  if (!fam) return c.json({ error: "You're not in a family" }, 400);
  if (fam.owner_id === user.id) return c.json({ error: "Owners can't leave their own family — cancel the plan instead" }, 400);
  await c.env.DB.prepare("DELETE FROM family_members WHERE family_id = ? AND user_id = ?").bind(fam.id, user.id).run();
  await notify(c.env, fam.owner_id, "family", `${user.name || user.email} left your family`, undefined);
  return c.json({ ok: true, account: await accountView(c.env, user) });
});

/* ------------------------------------------------------------------ *
 * Master overview — each member's app pushes a compact, locally-computed
 * snapshot; the plan owner reads them all in one place. Raw transactions
 * never leave the member's device — only these headline numbers.
 * ------------------------------------------------------------------ */
const SNAP_CATEGORY_MAX = 3;

function sanitizeSnapshot(raw: any): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0);
  const cats = Array.isArray(raw.topCategories) ? raw.topCategories.slice(0, SNAP_CATEGORY_MAX) : [];
  return {
    netWorth: num(raw.netWorth),
    assets: num(raw.assets),
    liabilities: num(raw.liabilities),
    liquid: num(raw.liquid),
    income30: num(raw.income30),
    expenses30: num(raw.expenses30),
    debtTotal: num(raw.debtTotal),
    investTotal: num(raw.investTotal),
    budgetCount: num(raw.budgetCount),
    budgetOverCount: num(raw.budgetOverCount),
    goalCount: num(raw.goalCount),
    goalAvgPct: Math.max(0, Math.min(100, num(raw.goalAvgPct))),
    topCategories: cats.map((c: any) => ({
      name: String(c?.name ?? "").slice(0, 40),
      icon: String(c?.icon ?? "•").slice(0, 8),
      amount: num(c?.amount),
    })),
  };
}

/** A member's app pushes its latest snapshot (owner's app pushes too). */
app.post("/family/snapshot", auth, async (c) => {
  const user = await getUserById(c.env, c.get("userId"));
  if (!user) return c.json({ error: "Not found" }, 404);
  const fam = (await familyByOwner(c.env, user.id)) ?? (await familyOfMember(c.env, user.id));
  if (!fam) return c.json({ error: "You're not sharing a plan with anyone" }, 400);
  const snap = sanitizeSnapshot(await c.req.json().catch(() => null));
  if (!snap) return c.json({ error: "Bad snapshot" }, 400);
  await c.env.DB.prepare(
    `INSERT INTO family_snapshots (family_id, user_id, data, updated_at) VALUES (?,?,?,?)
     ON CONFLICT(family_id, user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).bind(fam.id, user.id, JSON.stringify(snap), now()).run();
  return c.json({ ok: true });
});

/** Owner reads every member's snapshot — the Master tab's data source. */
app.get("/family/overview", auth, async (c) => {
  const user = await getUserById(c.env, c.get("userId"));
  if (!user) return c.json({ error: "Not found" }, 404);
  const fam = await familyByOwner(c.env, user.id);
  if (!fam) return c.json({ error: "Only the plan owner can see the master overview" }, 403);

  const snap = await familySnapshot(c.env, fam, true);
  const snaps = await c.env.DB.prepare("SELECT user_id, data, updated_at FROM family_snapshots WHERE family_id = ?")
    .bind(fam.id)
    .all<{ user_id: string; data: string; updated_at: string }>();
  const byUser = new Map((snaps.results ?? []).map((r) => [r.user_id, r]));

  const members = snap.members.map((m) => {
    const row = byUser.get(m.id);
    let data: Record<string, unknown> | null = null;
    try { data = row ? (JSON.parse(row.data) as Record<string, unknown>) : null; } catch { /* skip corrupt */ }
    return { ...m, snapshot: data, snapshotAt: row?.updated_at ?? null };
  });
  const sum = (k: string) => members.reduce((s, m) => s + Number((m.snapshot as any)?.[k] ?? 0), 0);
  return c.json({
    family: { id: fam.id, seatLimit: snap.seatLimit, seatsLeft: snap.seatsLeft },
    members,
    totals: {
      netWorth: sum("netWorth"),
      liquid: sum("liquid"),
      income30: sum("income30"),
      expenses30: sum("expenses30"),
      debtTotal: sum("debtTotal"),
      investTotal: sum("investTotal"),
      reporting: members.filter((m) => m.snapshot).length,
    },
  });
});

/* ------------------------------------------------------------------ *
 * Custom / Enterprise orders + redeemable codes.
 *
 * Flow: build a plan on the site → POST /orders (public) → we scan the
 * picked features, price them by step band and email a receipt. Once paid,
 * an admin call fulfils the order into a redemption code (also reusable by a
 * future Stripe webhook). The buyer redeems the code (POST /codes/redeem),
 * which unlocks the plan and lets them share seats by email — the exact same
 * mechanism Family plans already use.
 * ------------------------------------------------------------------ */
interface OrderRow {
  ref: string; plan_type: string; contact_name: string; contact_email: string;
  seats: number; item_count: number; items: string; per_person: number; amount_cents: number;
  status: string; code: string | null; created_at: string; updated_at: string;
}
interface CodeRow {
  code: string; kind: string; tier: string; seats: number; features: string | null;
  order_ref: string | null; status: string; redeemed_by: string | null; redeemed_at: string | null;
  expires_at: number | null; created_at: string;
}

// Crockford base32 minus ambiguous chars (no I, L, O, U) — friendly to type.
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function randChars(n: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let out = "";
  for (let i = 0; i < n; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return out;
}
const newOrderRef = () => `BS-${randChars(6)}`;
const newCodeCore = () => `BSMART${randChars(8)}`; // canonical stored form (no dashes)
const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
function formatCode(core: string): string {
  const body = core.replace(/^BSMART/, "");
  return `BSMART-${body.slice(0, 4)}-${body.slice(4, 8)}`;
}
const YEAR_SECONDS = 365 * 86_400;

/** Public: submit a Custom/Enterprise plan build → priced receipt by email. */
app.post("/orders", async (c) => {
  // Public + sends email → strict per-IP cap so it can't be used to spam.
  const rl = await checkRateLimit(c.env, `orders:${await ipHash(c.env, c.get("ip"))}`, 6, 3600);
  if (!rl.ok) {
    await logSec(c, { severity: "warn", type: "ratelimit", ip: c.get("ip"), country: c.get("country"), path: "/orders" });
    c.res.headers.set("Retry-After", String(rl.retryAfter));
    return c.json({ error: "Too many order submissions — please wait a bit and try again." }, 429);
  }
  const b = await c.req.json().catch(() => ({}));
  const email = normEmail(String(b.email ?? ""));
  const name = String(b.name ?? "").trim().slice(0, 80);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: "Enter a valid email address" }, 400);
  const seats = Math.floor(Number(b.seats) || 0);
  if (seats < MIN_CUSTOM_SEATS) return c.json({ error: `Teams start at ${MIN_CUSTOM_SEATS} people` }, 400);
  const items = Array.isArray(b.items) ? b.items.map(String) : [];
  const quote = quoteOrder(seats, items);

  const ref = newOrderRef();
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO plan_orders (ref, plan_type, contact_name, contact_email, seats, item_count, items, per_person, amount_cents, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?, 'receipt_sent', ?, ?)`,
  ).bind(ref, quote.planType, name, email, quote.seats, quote.itemCount, JSON.stringify(quote.items), quote.perPersonYear, quote.totalCents, ts, ts).run();

  // Create a hosted Stripe Checkout link (ad-hoc price = this order's total) so
  // the customer can pay right away. On success the webhook fulfils the order
  // into a redemption code and emails it — fully automatic. If Stripe isn't
  // reachable we still record the order and fall back to a "reply for invoice".
  const origin = new URL(c.env.APP_URL).origin;
  let payUrl: string | undefined;
  if (c.env.STRIPE_SECRET_KEY) {
    try {
      const productName = `BudgetSmart ${quote.planType === "enterprise" ? "Enterprise" : "Custom"} plan — ${quote.seats} seats (annual)`;
      const session = await stripe<{ url: string; id: string }>(c.env, "checkout/sessions", "POST", {
        mode: "payment",
        "line_items[0][quantity]": 1,
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": quote.totalCents,
        "line_items[0][price_data][product_data][name]": productName,
        customer_email: email,
        "metadata[kind]": "plan_order",
        "metadata[orderRef]": ref,
        "payment_intent_data[metadata][kind]": "plan_order",
        "payment_intent_data[metadata][orderRef]": ref,
        success_url: `${origin}/account?order=paid`,
        cancel_url: `${origin}/build?order=cancel`,
      });
      payUrl = session.url;
      await c.env.DB.prepare("UPDATE plan_orders SET status = 'checkout_sent', updated_at = ? WHERE ref = ?").bind(now(), ref).run();
    } catch (err) {
      console.error("plan-order checkout create failed", String(err));
    }
  }

  const receipt = {
    ref, planType: quote.planType, seats: quote.seats, itemLabels: quote.items.map(planFeatureLabel),
    perPersonYear: quote.perPersonYear, blockFee: quote.blockFee, total: quote.total, payUrl,
  };
  const sent = await sendOrderReceiptEmail(c.env, email, name, receipt);
  // Drop an ops copy in the business inbox so new orders are visible.
  if (c.env.GMAIL_USER && c.env.GMAIL_USER !== email) {
    await sendOrderReceiptEmail(c.env, c.env.GMAIL_USER, "BudgetSmart team", receipt).catch(() => {});
  }
  return c.json({ ok: true, ref, sent, payUrl, quote });
});

/** Turn a paid order into a redemption code (idempotent). Emails the code.
 *  Shared by the admin fulfil endpoint and, later, the Stripe webhook. */
async function fulfillOrder(env: Env, order: OrderRow): Promise<CodeRow> {
  if (order.code) {
    const existing = await env.DB.prepare("SELECT * FROM redemption_codes WHERE code = ?").bind(order.code).first<CodeRow>();
    if (existing) return existing;
  }
  const core = newCodeCore();
  const tier = "fam_t3"; // Custom/Enterprise grant the full team feature set; seats governs sharing.
  await env.DB.prepare(
    `INSERT INTO redemption_codes (code, kind, tier, seats, features, order_ref, status, expires_at, created_at)
     VALUES (?,?,?,?,?,?, 'unredeemed', ?, ?)`,
  ).bind(core, order.plan_type, tier, order.seats, order.items, order.ref, unix() + YEAR_SECONDS, now()).run();
  await env.DB.prepare("UPDATE plan_orders SET status = 'fulfilled', code = ?, updated_at = ? WHERE ref = ?").bind(core, now(), order.ref).run();
  const planLabel = `${order.plan_type === "enterprise" ? "Enterprise" : "Custom"} (${order.seats} seats)`;
  await sendRedemptionCodeEmail(env, order.contact_email, order.contact_name, { code: formatCode(core), planLabel, seats: order.seats });
  return (await env.DB.prepare("SELECT * FROM redemption_codes WHERE code = ?").bind(core).first<CodeRow>())!;
}

/** Admin: mark an order paid and issue its code. Guarded by the upload token. */
app.post("/admin/orders/fulfill", async (c) => {
  if (!uploadAllowed(c)) return c.json({ error: "unauthorized" }, 401);
  const ref = String((await c.req.json().catch(() => ({}))).ref ?? "").trim().toUpperCase();
  const order = await c.env.DB.prepare("SELECT * FROM plan_orders WHERE ref = ?").bind(ref).first<OrderRow>();
  if (!order) return c.json({ error: "Order not found" }, 404);
  const code = await fulfillOrder(c.env, order);
  return c.json({ ok: true, ref: order.ref, code: formatCode(code.code) });
});

/** Admin: list recent orders for fulfilment. */
app.get("/admin/orders", async (c) => {
  if (!uploadAllowed(c)) return c.json({ error: "unauthorized" }, 401);
  const rows = (
    await c.env.DB.prepare(
      "SELECT ref, plan_type, contact_email, seats, item_count, amount_cents, status, code, created_at FROM plan_orders ORDER BY created_at DESC LIMIT 100",
    ).all()
  ).results;
  return c.json({ orders: rows });
});

/** Admin: mint a code directly (comps / gifts / manual fulfilment). */
app.post("/admin/codes/create", async (c) => {
  if (!uploadAllowed(c)) return c.json({ error: "unauthorized" }, 401);
  const b = await c.req.json().catch(() => ({}));
  const tier = String(b.tier ?? "fam_t3");
  if (!isValidTier(tier)) return c.json({ error: "Invalid tier" }, 400);
  const seats = Math.max(1, Math.floor(Number(b.seats) || 1));
  const days = Math.max(1, Math.floor(Number(b.days) || 365));
  const core = newCodeCore();
  await c.env.DB.prepare(
    "INSERT INTO redemption_codes (code, kind, tier, seats, status, expires_at, created_at) VALUES (?,?,?,?, 'unredeemed', ?, ?)",
  ).bind(core, seats > 1 ? "custom" : "gift", tier, seats, unix() + days * 86_400, now()).run();
  return c.json({ ok: true, code: formatCode(core), tier, seats });
});

/** Apply a code's entitlement to a user (+ set up their shareable team). */
async function applyCodeToUser(env: Env, user: UserRow, code: CodeRow): Promise<void> {
  await setEntitlement(env, user.id, { tier: code.tier, status: "active", periodEnd: code.expires_at ?? unix() + YEAR_SECONDS });
  if (code.seats > 1) {
    let fam = await familyByOwner(env, user.id);
    if (!fam) {
      const id = newId();
      await env.DB.prepare("INSERT INTO families (id, owner_id, created_at) VALUES (?,?,?)").bind(id, user.id, now()).run();
      await env.DB.prepare("INSERT INTO family_members (family_id, user_id, role, joined_at) VALUES (?,?,'owner',?)").bind(id, user.id, now()).run();
      fam = await familyByOwner(env, user.id);
    }
    if (fam) await setFamilySeatLimit(env, fam.id, code.seats);
  }
}

/** Redeem a code → unlock the plan on the signed-in account. */
app.post("/codes/redeem", auth, async (c) => {
  const user = await getUserById(c.env, c.get("userId"));
  if (!user) return c.json({ error: "Not found" }, 404);
  // Codes are unguessable, but cap redemption attempts anyway so nobody can
  // grind the space or use us as an oracle.
  const rl = await checkRateLimit(c.env, `redeem:${user.id}`, 12, 3600);
  if (!rl.ok) {
    await logSec(c, { severity: "high", type: "redeem_abuse", ip: c.get("ip"), country: c.get("country"), userId: user.id, path: "/codes/redeem" });
    c.res.headers.set("Retry-After", String(rl.retryAfter));
    return c.json({ error: "Too many attempts — please wait before trying another code." }, 429);
  }
  const code = normalizeCode(String((await c.req.json().catch(() => ({}))).code ?? ""));
  if (!code) return c.json({ error: "Enter a code" }, 400);

  const row = await c.env.DB.prepare("SELECT * FROM redemption_codes WHERE code = ?").bind(code).first<CodeRow>();
  if (!row) {
    await logSec(c, { severity: "info", type: "redeem_miss", ip: c.get("ip"), country: c.get("country"), userId: user.id, path: "/codes/redeem" });
    return c.json({ error: "That code isn't valid" }, 404);
  }
  if (row.status === "revoked") return c.json({ error: "That code has been revoked" }, 400);
  if (row.redeemed_by && row.redeemed_by !== user.id) return c.json({ error: "That code has already been redeemed" }, 400);
  if (row.expires_at && row.expires_at < unix()) return c.json({ error: "That code has expired" }, 400);

  if (row.seats > 1) {
    const memberFam = await familyOfMember(c.env, user.id);
    if (memberFam && memberFam.owner_id !== user.id) {
      return c.json({ error: "Leave your current shared plan before redeeming a team code" }, 400);
    }
  }

  await applyCodeToUser(c.env, user, row);
  if (!row.redeemed_by) {
    await c.env.DB.prepare("UPDATE redemption_codes SET status = 'active', redeemed_by = ?, redeemed_at = ? WHERE code = ?")
      .bind(user.id, now(), code).run();
  }
  await notify(
    c.env, user.id, "billing", "Plan unlocked 🎉",
    row.seats > 1 ? "Your team plan is active — invite your team by email from Sharing below." : "Your plan is active. Reload the app to sync your features.",
  );
  const updated = await getUserById(c.env, user.id);
  return c.json({ ok: true, account: await accountView(c.env, updated!) });
});

/**
 * Monthly digest email (T1+). The app computes the numbers locally and sends
 * only this structured payload; we render + mail it from the bot Gmail.
 */
app.post("/email/monthly-summary", auth, async (c) => {
  const user = await getUserById(c.env, c.get("userId"));
  if (!user) return c.json({ error: "Not found" }, 404);
  const tier = await resolveTier(c.env, user);
  if (tier === "base") return c.json({ error: "Monthly summaries need a Tier 1+ plan" }, 403);

  // Light abuse guard: at most one summary email per 20h per account.
  const last = await c.env.DB.prepare("SELECT summary_sent_at FROM users WHERE id = ?").bind(user.id).first<{ summary_sent_at: number | null }>();
  if (last?.summary_sent_at && unix() - last.summary_sent_at < 20 * 3600) {
    return c.json({ error: "A summary was already sent recently — try again tomorrow" }, 429);
  }

  const b = (await c.req.json().catch(() => null)) as Partial<DigestPayload> | null;
  if (!b || !/^\d{4}-\d{2}$/.test(String(b.month))) return c.json({ error: "Invalid summary payload" }, 400);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0);
  const digest: DigestPayload = {
    month: String(b.month),
    weekLabel: typeof (b as { weekLabel?: unknown }).weekLabel === "string" ? String((b as { weekLabel?: string }).weekLabel).slice(0, 40) : null,
    income: num(b.income),
    expenses: num(b.expenses),
    net: num(b.net),
    txCount: Math.min(num(b.txCount), 1_000_000),
    expenseDeltaPct: typeof b.expenseDeltaPct === "number" && Number.isFinite(b.expenseDeltaPct) ? b.expenseDeltaPct : null,
    topCategories: (Array.isArray(b.topCategories) ? b.topCategories.slice(0, 5) : []).map((cat: any) => ({
      name: String(cat?.name ?? "").slice(0, 40),
      icon: String(cat?.icon ?? "◦").slice(0, 4),
      amount: num(cat?.amount),
    })),
    budgets:
      b.budgets && typeof b.budgets === "object"
        ? {
            count: Math.min(num((b.budgets as any).count), 500),
            overCount: Math.min(num((b.budgets as any).overCount), 500),
            totalLimit: num((b.budgets as any).totalLimit),
            totalSpent: num((b.budgets as any).totalSpent),
          }
        : null,
    subscriptionCount: Math.min(num(b.subscriptionCount), 500),
    subscriptionMonthly: num(b.subscriptionMonthly),
    liquidBalance: num(b.liquidBalance),
  };

  const sent = await sendMonthlyDigestEmail(c.env, user.email, user.name, digest);
  if (!sent) return c.json({ error: "Couldn't send the email — try again later" }, 502);
  await c.env.DB.prepare("UPDATE users SET summary_sent_at = ? WHERE id = ?").bind(unix(), user.id).run();
  return c.json({ ok: true, sentTo: user.email });
});

/* ------------------------------------------------------------------ *
 * Market data (public, cached) — the site ticker & app price sync.
 * ------------------------------------------------------------------ */
app.get("/market/summary", async (c) => {
  const quotes = await getQuotes(c.env, CORE_SYMBOLS.map((s) => s.symbol), false);
  const byId = new Map(quotes.map((q) => [q.symbol, q]));
  return c.json({
    quotes: CORE_SYMBOLS.map((s) => ({ label: s.label, ...byId.get(s.symbol) })).filter((q) => typeof (q as { price?: number }).price === "number"),
  });
});

app.get("/market/history", async (c) => {
  const symbol = (c.req.query("symbol") ?? "").trim();
  if (!symbol) return c.json({ error: "Pass ?symbol=SPY" }, 400);
  const years = Math.min(20, Math.max(1, Number(c.req.query("years")) || 8));
  const points = await getHistory(c.env, symbol, years);
  if (points.length === 0) return c.json({ error: "No history for that symbol" }, 404);
  return c.json({ symbol: symbol.toUpperCase(), points });
});

app.get("/market/quote", async (c) => {
  const raw = (c.req.query("symbols") ?? "").split(",").map((s) => toProviderSymbol(s)).filter(Boolean);
  if (raw.length === 0) return c.json({ error: "Pass ?symbols=AAPL,VOO" }, 400);
  return c.json({ quotes: await getQuotes(c.env, raw) });
});

/** Start the 7-day Tier 3 free trial (once per account, base tier only). */
app.post("/trial/start", auth, async (c) => {
  const user = await getUserById(c.env, c.get("userId"));
  if (!user) return c.json({ error: "Not found" }, 404);
  if (user.tier !== "base") return c.json({ error: "You already have a paid plan" }, 400);
  if (user.trial_ends_at) return c.json({ error: "Your free trial was already used" }, 400);
  const ends = unix() + TRIAL_DAYS * 86_400;
  await c.env.DB.prepare("UPDATE users SET trial_ends_at = ?, updated_at = ? WHERE id = ?").bind(ends, now(), user.id).run();
  await notify(c.env, user.id, "trial", `Your ${TRIAL_DAYS}-day Tier 3 trial started 🎉`, "Every premium feature is unlocked. Reload the app to sync.");
  const updated = await getUserById(c.env, user.id);
  return c.json({ account: await accountView(c.env, updated!) });
});

/** The endpoint the desktop app polls on reload to sync its tier. */
app.get("/entitlement", auth, async (c) => {
  const user = await getUserById(c.env, c.get("userId"));
  if (!user) return c.json({ error: "Not found" }, 404);
  const tier = await resolveTier(c.env, user); // family members inherit the owner's tier
  return c.json({
    tier,
    subscriptionStatus: user.subscription_status,
    currentPeriodEnd: user.current_period_end,
    emailVerified: user.email_verified === 1,
    // Signed proof of entitlement the app verifies with the embedded public key.
    token: await signEntitlement(c.env, user.id, tier),
  });
});

/* ------------------------------------------------------------------ *
 * Billing (Stripe)
 * ------------------------------------------------------------------ */
app.post("/billing/checkout", auth, async (c) => {
  const user = await getUserById(c.env, c.get("userId"));
  if (!user) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const tierId = String(body.tierId ?? "");
  const interval = isInterval(String(body.interval ?? "month")) ? (String(body.interval ?? "month") as "month" | "year") : "month";
  if (!isValidTier(tierId)) return c.json({ error: "Unknown plan" }, 400);
  if (tierId === "base") return c.json({ error: "The Base plan is free — no checkout needed." }, 400);
  const price = priceIdForTier(c.env, tierId, interval);
  if (!price) return c.json({ error: "Billing isn't configured for this plan yet." }, 503);

  const session = await stripe<{ url: string; id: string }>(c.env, "checkout/sessions", "POST", {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": 1,
    client_reference_id: user.id,
    ...(user.stripe_customer_id ? { customer: user.stripe_customer_id } : { customer_email: user.email }),
    "metadata[userId]": user.id,
    "metadata[tierId]": tierId,
    "subscription_data[metadata][userId]": user.id,
    "subscription_data[metadata][tierId]": tierId,
    success_url: `${new URL(c.env.APP_URL).origin}/account?checkout=success`,
    cancel_url: `${new URL(c.env.APP_URL).origin}/account?checkout=cancel`,
  });
  return c.json({ url: session.url });
});

app.post("/billing/portal", auth, async (c) => {
  const user = await getUserById(c.env, c.get("userId"));
  if (!user?.stripe_customer_id) return c.json({ error: "No billing account yet" }, 400);
  const session = await stripe<{ url: string }>(c.env, "billing_portal/sessions", "POST", {
    customer: user.stripe_customer_id,
    return_url: `${new URL(c.env.APP_URL).origin}/account`,
  });
  return c.json({ url: session.url });
});

/* ------------------------------------------------------------------ *
 * Stripe webhook — the source of truth for entitlement changes.
 * ------------------------------------------------------------------ */
app.post("/webhooks/stripe", async (c) => {
  const payload = await c.req.text();
  const ok = await verifyStripeSignature(payload, c.req.header("stripe-signature") ?? null, c.env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return c.json({ error: "Bad signature" }, 400);

  const event = JSON.parse(payload) as { id: string; type: string; data: { object: any } };

  // Idempotency: skip if we've already applied this event.
  const dup = await c.env.DB.prepare("SELECT id FROM processed_events WHERE id = ?").bind(event.id).first();
  if (dup) return c.json({ received: true, duplicate: true });

  try {
    await handleEvent(c.env, event);
  } catch (err) {
    console.error("webhook handler error", event.type, String(err));
    return c.json({ error: "handler failed" }, 500); // let Stripe retry
  }
  await c.env.DB.prepare("INSERT OR IGNORE INTO processed_events (id, created_at) VALUES (?, ?)").bind(event.id, now()).run();
  return c.json({ received: true });
});

async function setEntitlement(
  env: Env,
  userId: string,
  fields: { tier?: string; customerId?: string; subId?: string | null; status?: string | null; periodEnd?: number | null },
) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (fields.tier !== undefined) (sets.push("tier = ?"), vals.push(fields.tier));
  if (fields.customerId !== undefined) (sets.push("stripe_customer_id = ?"), vals.push(fields.customerId));
  if (fields.subId !== undefined) (sets.push("subscription_id = ?"), vals.push(fields.subId));
  if (fields.status !== undefined) (sets.push("subscription_status = ?"), vals.push(fields.status));
  if (fields.periodEnd !== undefined) (sets.push("current_period_end = ?"), vals.push(fields.periodEnd));
  if (!sets.length) return;
  sets.push("updated_at = ?");
  vals.push(now(), userId);
  await env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
}

async function resolveUserId(env: Env, obj: any): Promise<string | undefined> {
  const metaUser = obj?.metadata?.userId;
  if (metaUser) return metaUser;
  if (obj?.client_reference_id) return obj.client_reference_id;
  if (obj?.customer) {
    const u = await getUserByCustomer(env, obj.customer);
    if (u) return u.id;
  }
  return undefined;
}

async function handleEvent(env: Env, event: { type: string; data: { object: any } }) {
  const obj = event.data.object;
  switch (event.type) {
    case "checkout.session.completed": {
      // Custom/Enterprise plan order: no user account needed — the paid order
      // is fulfilled into a redemption code that gets emailed to the buyer.
      if (obj.metadata?.kind === "plan_order" && obj.metadata?.orderRef) {
        if (obj.payment_status && obj.payment_status !== "paid") return;
        const order = await env.DB.prepare("SELECT * FROM plan_orders WHERE ref = ?").bind(String(obj.metadata.orderRef)).first<OrderRow>();
        if (order) await fulfillOrder(env, order);
        return;
      }
      const userId = await resolveUserId(env, obj);
      if (!userId) return;
      const customerId = obj.customer as string | undefined;
      if (obj.mode === "subscription" && obj.subscription) {
        const sub = await stripe<any>(env, `subscriptions/${obj.subscription}`, "GET");
        const priceId = sub.items?.data?.[0]?.price?.id;
        const tier = (priceId && tierForPriceId(env, priceId)) || obj.metadata?.tierId || "base";
        await setEntitlement(env, userId, {
          tier,
          customerId,
          subId: sub.id,
          status: sub.status,
          periodEnd: sub.current_period_end,
        });
        await notify(env, userId, "billing", "Subscription active ✅", "Thanks for subscribing! Open the app and reload to unlock your plan.");
      } else {
        // one-time (Base app)
        await setEntitlement(env, userId, { tier: obj.metadata?.tierId || "base", customerId, status: "active" });
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const userId = await resolveUserId(env, obj);
      if (!userId) return;
      const priceId = obj.items?.data?.[0]?.price?.id;
      const tier = (priceId && tierForPriceId(env, priceId)) || obj.metadata?.tierId;
      const active = obj.status === "active" || obj.status === "trialing";
      await setEntitlement(env, userId, {
        ...(active && tier ? { tier } : {}),
        ...(obj.customer ? { customerId: obj.customer as string } : {}),
        subId: obj.id,
        status: obj.status,
        periodEnd: obj.current_period_end,
      });
      break;
    }
    case "customer.subscription.deleted": {
      const userId = await resolveUserId(env, obj);
      if (!userId) return;
      // Subscription ended → fall back to the one-time Base entitlement.
      await setEntitlement(env, userId, { tier: "base", subId: null, status: "canceled", periodEnd: null });
      break;
    }
    default:
      break;
  }
}

/* ------------------------------------------------------------------ *
 * APT repository — serves the Debian package repo from R2 so users can
 * `sudo apt install budgetsmart`. Files are published under apt/ keys by CI.
 * ------------------------------------------------------------------ */
function aptContentType(key: string): string {
  if (key.endsWith(".deb")) return "application/vnd.debian.binary-package";
  if (key.endsWith(".gz")) return "application/gzip";
  if (key.endsWith(".gpg") || key.endsWith(".asc")) return "application/pgp-keys";
  return "text/plain; charset=utf-8"; // Release, InRelease, Packages
}
app.get("/apt/*", async (c) => {
  const key = c.req.path.replace(/^\/+/, ""); // "apt/dists/stable/Release"
  const obj = await c.env.DOWNLOADS.get(key);
  if (!obj) return c.text("Not found", 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("Content-Type", aptContentType(key));
  // apt indexes must not be served stale; the .deb is immutable per version.
  headers.set("Cache-Control", key.endsWith(".deb") ? "public, max-age=86400" : "no-cache");
  headers.set("Content-Length", String(obj.size));
  return new Response(obj.body, { status: 200, headers });
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(refreshMarket(env));
  },
};
