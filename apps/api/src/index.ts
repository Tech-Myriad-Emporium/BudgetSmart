import { Hono } from "hono";
import { cors } from "hono/cors";
import { sign, verify } from "hono/jwt";
import { hashPassword, verifyPassword, randomToken, newId } from "./crypto.js";
import { sendVerificationEmail, sendFamilyInviteEmail, sendMonthlyDigestEmail, type DigestPayload } from "./email.js";
import { stripe, verifyStripeSignature } from "./stripe.js";
import { isInterval, isValidTier, priceIdForTier, tierForPriceId } from "./tiers.js";
import { generateSecret, verifyTotp, otpauthUri } from "./totp.js";
import type { AccountView, Env, UserRow } from "./types.js";

type Vars = { userId: string };
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

/** Effective tier = inherited family tier if any, otherwise the user's own. */
async function resolveTier(env: Env, u: UserRow): Promise<string> {
  if (u.tier.startsWith("fam_")) return u.tier; // owner already has it
  return (await familyTierFor(env, u.id)) ?? u.tier;
}

/** Client-facing account view with the effective (possibly inherited) tier. */
async function accountView(env: Env, u: UserRow): Promise<AccountView> {
  return { ...view(u, env), tier: await resolveTier(env, u) };
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
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }),
);

app.get("/", (c) => c.json({ service: "budgetsmart-api", status: "ok", time: now() }));
app.get("/health", (c) => c.json({ status: "ok" }));

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
  const body = await c.req.json().catch(() => ({}));
  const email = normEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim();
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

  await createAndSendVerification(c.env, user);
  await notify(c.env, user.id, "welcome", "Welcome to BudgetSmart 🎉", "Your account is ready. Verify your email, then choose a plan and connect the app.");
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
  const body = await c.req.json().catch(() => ({}));
  const email = normEmail(String(body.email ?? ""));
  const user = await getUserByEmail(c.env, email);
  if (user && user.email_verified === 0) await createAndSendVerification(c.env, user);
  return c.json({ ok: true }); // always ok (don't leak existence)
});

app.post("/auth/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");
  const user = await getUserByEmail(c.env, email);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: "Incorrect email or password" }, 401);
  }
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
  if (!(await verifyTotp(user.totp_secret, String(body.code ?? "")))) {
    return c.json({ error: "Incorrect code — check your authenticator app" }, 401);
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
  await c.env.DB.prepare("UPDATE users SET totp_secret = ?, updated_at = ? WHERE id = ?").bind(secret, now(), user.id).run();
  return c.json({ secret, otpauth: otpauthUri(user.email, secret) });
});

/** Confirm setup: verify a code against the pending secret, then activate. */
app.post("/account/2fa/enable", auth, async (c) => {
  const user = await getUserById(c.env, c.get("userId"));
  if (!user) return c.json({ error: "Not found" }, 404);
  if (!user.totp_secret) return c.json({ error: "Start setup first" }, 400);
  const code = String((await c.req.json().catch(() => ({}))).code ?? "");
  if (!(await verifyTotp(user.totp_secret, code))) return c.json({ error: "That code didn't match — check your authenticator" }, 400);
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
  if (user.totp_enabled === 1 && user.totp_secret && !(await verifyTotp(user.totp_secret, code))) {
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
const FAMILY_SIZE = 5;
const INVITE_TTL_SECONDS = 60 * 60 * 24 * 14; // invites last 14 days

interface FamilyRow { id: string; owner_id: string; created_at: string }
interface InviteRow { id: string; token: string; family_id: string; from_user_id: string; to_email: string; status: string; created_at: string; expires_at: number }

const familyByOwner = (env: Env, ownerId: string) =>
  env.DB.prepare("SELECT * FROM families WHERE owner_id = ?").bind(ownerId).first<FamilyRow>();
const familyOfMember = (env: Env, userId: string) =>
  env.DB.prepare("SELECT f.* FROM families f JOIN family_members m ON m.family_id = f.id WHERE m.user_id = ?").bind(userId).first<FamilyRow>();

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
  return {
    id: fam.id,
    ownerId: fam.owner_id,
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      joinedAt: m.joined_at,
      avatarUrl: m.avatar_key ? `${env.API_ORIGIN}/avatar/${m.id}` : null,
    })),
    invites,
    seatsLeft: Math.max(0, FAMILY_SIZE - members.length - invites.length),
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
  if (snap.seatsLeft <= 0) return c.json({ error: `Family plans cover ${FAMILY_SIZE} people — remove a member or revoke an invite first` }, 400);
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
  if ((count?.n ?? 0) >= FAMILY_SIZE) return c.json({ error: "This family is already full" }, 400);

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

export default app;
