import { Hono } from "hono";
import { cors } from "hono/cors";
import { sign, verify } from "hono/jwt";
import { hashPassword, verifyPassword, randomToken, newId } from "./crypto.js";
import { sendVerificationEmail } from "./email.js";
import { stripe, verifyStripeSignature } from "./stripe.js";
import { isInterval, isValidTier, priceIdForTier, tierForPriceId } from "./tiers.js";
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
  const token = await issueToken(c.env, user);
  return c.json({ token, account: view(user, c.env) });
});

app.get("/me", auth, async (c) => {
  const user = await getUserById(c.env, c.get("userId"));
  if (!user) return c.json({ error: "Not found" }, 404);
  return c.json({ account: view(user, c.env) });
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
  return c.json({ account: view(updated!, c.env) });
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
  return c.json({ account: view(updated!, c.env) });
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

/** The endpoint the desktop app polls on reload to sync its tier. */
app.get("/entitlement", auth, async (c) => {
  const user = await getUserById(c.env, c.get("userId"));
  if (!user) return c.json({ error: "Not found" }, 404);
  return c.json({
    tier: user.tier,
    subscriptionStatus: user.subscription_status,
    currentPeriodEnd: user.current_period_end,
    emailVerified: user.email_verified === 1,
    // Signed proof of entitlement the app verifies with the embedded public key.
    token: await signEntitlement(c.env, user.id, user.tier),
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
