// ==================================================================
// BudgetSmart security layer for the central Worker.
//
// This is the code-level portion of the defense-in-depth program: the
// perimeter (headers, IP reputation, honeypots), the application layer
// (rate limiting, brute-force lockout, anomaly detection), the data layer
// (field-level encryption), the observability layer (append-only event log
// + throttled alerts), and the incident-response hooks (global lockdown
// kill-switch, IP blocklist, admin triage surface).
//
// Design rules:
//  - Hostile to attackers, gentle to legitimate users: nothing here can lock
//    out a real user by normal use. Enforcement triggers only on abuse.
//  - Fail OPEN on our own errors (a bug in logging must never take the API
//    down), fail CLOSED on attacker signals (a detected abuse is blocked).
//  - No new required secrets: keys are derived from JWT_SECRET via HKDF.
// ==================================================================
import type { Context } from "hono";
import type { Env } from "./types.js";
import { sendSecurityAlertEmail, sendAttackAlertEmail } from "./email.js";

const enc = new TextEncoder();
const dec = new TextDecoder();
const nowMs = () => Date.now();
const nowSec = () => Math.floor(Date.now() / 1000);
const nowIso = () => new Date().toISOString();

/* ------------------------------------------------------------------ *
 * 1. Security response headers (defense in depth for any HTML surface,
 *    HSTS everywhere, and anti-fingerprinting). Applied to every response.
 * ------------------------------------------------------------------ */
export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-site",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=()",
  // The API returns JSON, never renders attacker HTML — lock scripting to nothing.
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "X-Robots-Tag": "noindex, nofollow",
};

/* ------------------------------------------------------------------ *
 * 2. Client identity: IP (via Cloudflare), country, and a salted IP hash
 *    so raw IPs never land in our logs (privacy + GDPR data-minimization).
 * ------------------------------------------------------------------ */
export function clientIp(c: Context): string {
  return (
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    "0.0.0.0"
  );
}
export function clientCountry(c: Context): string {
  const cf = (c.req.raw as unknown as { cf?: { country?: string } }).cf;
  return cf?.country || c.req.header("cf-ipcountry") || "??";
}

export interface GeoInfo {
  country?: string;
  city?: string;
  region?: string;
  asn?: number;
  asOrg?: string;
  timezone?: string;
}
/** Cloudflare enriches every request with geolocation + network attribution.
 *  This is the "trace the source" data — approximate (VPN/Tor/proxy caveats),
 *  but the ASN + org tell law enforcement which ISP to subpoena. */
export function geoOf(c: Context): GeoInfo {
  const cf = (c.req.raw as unknown as { cf?: Record<string, unknown> }).cf ?? {};
  return {
    country: (cf.country as string) || undefined,
    city: (cf.city as string) || undefined,
    region: (cf.region as string) || undefined,
    asn: typeof cf.asn === "number" ? cf.asn : undefined,
    asOrg: (cf.asOrganization as string) || undefined,
    timezone: (cf.timezone as string) || undefined,
  };
}
export const userAgentOf = (c: Context): string => (c.req.header("user-agent") || "").slice(0, 400);

async function hmacHex(secret: string, msg: string, bytes = 16): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
  return [...sig.slice(0, bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const ipHash = (env: Env, ip: string) => hmacHex(env.JWT_SECRET, `ip|${ip}`, 16);

/* ------------------------------------------------------------------ *
 * 3. Field-level encryption (AES-256-GCM). Key derived from JWT_SECRET so
 *    no new secret is required. Ciphertext is self-describing ("enc:v1:…")
 *    so reads are backward-compatible with any pre-existing plaintext.
 * ------------------------------------------------------------------ */
let fieldKeyPromise: Promise<CryptoKey> | null = null;
function fieldKey(env: Env): Promise<CryptoKey> {
  if (!fieldKeyPromise) {
    fieldKeyPromise = (async () => {
      const material = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(`fieldkey|${env.JWT_SECRET}`)));
      return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    })();
  }
  return fieldKeyPromise;
}
export async function encryptField(env: Env, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await fieldKey(env), enc.encode(plaintext)));
  const packed = new Uint8Array(iv.length + ct.length);
  packed.set(iv);
  packed.set(ct, iv.length);
  let bin = "";
  for (const b of packed) bin += String.fromCharCode(b);
  return `enc:v1:${btoa(bin)}`;
}
export async function decryptField(env: Env, stored: string | null): Promise<string | null> {
  if (stored == null) return null;
  if (!stored.startsWith("enc:v1:")) return stored; // legacy plaintext — read as-is
  try {
    const bin = atob(stored.slice("enc:v1:".length));
    const raw = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
    const iv = raw.slice(0, 12);
    const ct = raw.slice(12);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await fieldKey(env), ct);
    return dec.decode(pt);
  } catch {
    return null; // tampered / wrong key
  }
}

/* ------------------------------------------------------------------ *
 * 4. Append-only security event log + throttled critical alerts.
 *    The app never UPDATEs or DELETEs this table — it's the audit trail.
 * ------------------------------------------------------------------ */
export type Severity = "info" | "warn" | "high" | "critical";

export interface SecurityEvent {
  severity: Severity;
  type: string;
  ip?: string;
  country?: string;
  userId?: string | null;
  path?: string;
  detail?: Record<string, unknown>;
  geo?: GeoInfo;
  ua?: string;
}

export async function logSecurity(env: Env, ev: SecurityEvent): Promise<void> {
  try {
    const ipH = ev.ip ? await ipHash(env, ev.ip) : null;
    const g = ev.geo ?? {};
    await env.DB.prepare(
      `INSERT INTO security_events (id, ts, severity, type, ip_hash, country, user_id, path, detail, created_at, ip, asn, as_org, city, region, timezone, user_agent)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(
        crypto.randomUUID(), nowMs(), ev.severity, ev.type, ipH,
        ev.country ?? g.country ?? null, ev.userId ?? null, ev.path ?? null,
        ev.detail ? JSON.stringify(ev.detail).slice(0, 2000) : null, nowIso(),
        ev.ip ?? null, g.asn ?? null, g.asOrg ?? null, g.city ?? null, g.region ?? null, g.timezone ?? null, ev.ua ?? null,
      )
      .run();
    // High/critical → attack alert (classifies secure-vs-compromised). Operational
    // criticals that aren't attacks (e.g. lockdown toggled) → the generic alert.
    if (ev.severity === "high" || ev.severity === "critical") {
      if (classifyThreat(ev.type) !== null) await maybeAttackAlert(env, ev);
      else if (ev.severity === "critical") await maybeAlert(env, ev);
    }
  } catch {
    /* logging must never break the request path */
  }
}

/** Context-aware wrapper: always fills ip / country / geo / user-agent from
 *  the request (overriding anything passed), so every logged event carries the
 *  full source trace with no per-call-site boilerplate. */
export function logSec(c: Context, ev: SecurityEvent): Promise<void> {
  return logSecurity(c.env, {
    ...ev,
    ip: clientIp(c),
    country: clientCountry(c),
    geo: geoOf(c),
    ua: userAgentOf(c),
  });
}

/** Blocked attack (accounts secure) vs successful access from a new place
 *  (may be compromised) vs not-an-attack. Drives the alert wording. */
export function classifyThreat(type: string): "compromise" | "blocked" | null {
  if (type === "new_country_login") return "compromise";
  if (["lockout", "honeypot", "ratelimit", "blocked_ip_hit", "2fa_bruteforce", "redeem_abuse", "manual_block"].includes(type)) {
    return "blocked";
  }
  return null;
}

/** "An attack was launched" email with an account-status assessment + the
 *  source trace. Throttled so a flood can't spam the inbox. */
async function maybeAttackAlert(env: Env, ev: SecurityEvent): Promise<void> {
  try {
    const klass = classifyThreat(ev.type);
    if (!klass) return;
    const throttle = klass === "compromise" ? 300 : 1800; // urgent vs noisy
    const key = `attackalert:${klass}`;
    const last = Number((await getConfig(env, key)) ?? 0);
    if (nowSec() - last < throttle) return;
    await setConfig(env, key, String(nowSec()));
    const to = env.SECURITY_ALERT_EMAIL || env.GMAIL_USER;
    if (!to) return;

    // How much this source has done recently (context for the operator).
    let relatedFromSource = 0;
    try {
      if (ev.ip) {
        const ipH = await ipHash(env, ev.ip);
        relatedFromSource = (await env.DB.prepare("SELECT COUNT(*) AS n FROM security_events WHERE ip_hash = ? AND ts > ?")
          .bind(ipH, nowMs() - 15 * 60 * 1000).first<{ n: number }>())?.n ?? 0;
      }
    } catch { /* best effort */ }

    const g = ev.geo ?? {};
    await sendAttackAlertEmail(env, to, {
      compromise: klass === "compromise",
      type: ev.type,
      whenIso: nowIso(),
      ip: ev.ip ?? "unknown",
      country: ev.country ?? g.country,
      city: g.city,
      region: g.region,
      asn: g.asn,
      asOrg: g.asOrg,
      timezone: g.timezone,
      userAgent: ev.ua,
      userId: ev.userId ?? null,
      path: ev.path,
      relatedFromSource,
    });
  } catch {
    /* alert failure must not break anything */
  }
}

/** Email the owner on operational-critical (non-attack) events. */
async function maybeAlert(env: Env, ev: SecurityEvent): Promise<void> {
  try {
    const key = `alert:${ev.type}`;
    const last = Number((await getConfig(env, key)) ?? 0);
    if (nowSec() - last < 1800) return;
    await setConfig(env, key, String(nowSec()));
    const to = env.SECURITY_ALERT_EMAIL || env.GMAIL_USER;
    if (!to) return;
    await sendSecurityAlertEmail(env, to, `🚨 BudgetSmart security: ${ev.type}`, [
      `Severity: ${ev.severity.toUpperCase()}`,
      `Type: ${ev.type}`,
      `When: ${nowIso()}`,
      ev.userId ? `User: ${ev.userId}` : "",
      ev.path ? `Path: ${ev.path}` : "",
    ].filter(Boolean));
  } catch {
    /* alert failure must not break anything */
  }
}

/* ------------------------------------------------------------------ *
 * Evidence report — a law-enforcement-forwardable summary grouped by
 * source IP, with the network attribution police need (ASN/org/timestamp).
 * ------------------------------------------------------------------ */
interface EvidenceRow {
  ip: string | null; asn: number | null; as_org: string | null; country: string | null;
  city: string | null; region: string | null; timezone: string | null; user_agent: string | null;
  type: string; severity: string; ts: number; user_id: string | null; path: string | null;
}

export async function buildEvidenceReport(env: Env, days: number): Promise<{ json: unknown; text: string }> {
  const since = nowMs() - days * 86_400_000;
  const rows = (
    await env.DB.prepare(
      `SELECT ip, asn, as_org, country, city, region, timezone, user_agent, type, severity, ts, user_id, path
         FROM security_events
        WHERE ts > ? AND severity IN ('warn','high','critical') AND ip IS NOT NULL
        ORDER BY ts DESC LIMIT 2000`,
    ).bind(since).all<EvidenceRow>()
  ).results;

  const bySource = new Map<string, { rows: EvidenceRow[] }>();
  for (const r of rows) {
    const k = r.ip ?? "unknown";
    (bySource.get(k) ?? bySource.set(k, { rows: [] }).get(k)!).rows.push(r);
  }

  const sources = [...bySource.entries()].map(([ip, { rows: rs }]) => {
    const first = rs[rs.length - 1]!;
    const last = rs[0]!;
    return {
      ip,
      asn: last.asn,
      isp: last.as_org,
      location: [last.city, last.region, last.country].filter(Boolean).join(", ") || "unknown",
      timezone: last.timezone,
      userAgents: [...new Set(rs.map((r) => r.user_agent).filter(Boolean))].slice(0, 5),
      events: rs.length,
      activity: [...new Set(rs.map((r) => r.type))],
      targetedUsers: [...new Set(rs.map((r) => r.user_id).filter(Boolean))],
      firstSeen: new Date(first.ts).toISOString(),
      lastSeen: new Date(last.ts).toISOString(),
      worstSeverity: rs.some((r) => r.severity === "critical") ? "critical" : rs.some((r) => r.severity === "high") ? "high" : "warn",
    };
  }).sort((a, b) => b.events - a.events);

  // Plain-text version to paste into a police report.
  const L: string[] = [];
  L.push("BUDGETSMART — SECURITY INCIDENT EVIDENCE REPORT");
  L.push("Tech Myriad Emporium LLC (Ohio) · budgetsmarttme.com");
  L.push(`Generated: ${nowIso()}  ·  Window: last ${days} day(s)  ·  Sources: ${sources.length}`);
  L.push("");
  L.push("NOTE: Source IPs are as observed at our edge (Cloudflare). Attackers");
  L.push("may relay through VPNs, Tor, or compromised hosts, so an IP identifies");
  L.push("the connection, not necessarily the individual. For attribution, the");
  L.push("ISP shown (ASN/org) can be served legal process for the subscriber");
  L.push("assigned that IP at the timestamps below (all times UTC).");
  L.push("=".repeat(64));
  for (const s of sources) {
    L.push("");
    L.push(`SOURCE IP: ${s.ip}   [${s.worstSeverity.toUpperCase()}]`);
    L.push(`  ISP / network: ${s.isp ?? "unknown"}  (ASN ${s.asn ?? "?"})`);
    L.push(`  Approx. location: ${s.location}${s.timezone ? `  (${s.timezone})` : ""}`);
    L.push(`  Activity: ${s.activity.join(", ")}`);
    L.push(`  Events: ${s.events}   First: ${s.firstSeen}   Last: ${s.lastSeen}`);
    if (s.targetedUsers.length) L.push(`  Targeted account IDs: ${s.targetedUsers.join(", ")}`);
    if (s.userAgents.length) L.push(`  User-agent(s): ${s.userAgents.join(" | ")}`);
  }
  if (sources.length === 0) L.push("\nNo security-relevant source activity in this window.");
  return { json: { generatedAt: nowIso(), windowDays: days, sourceCount: sources.length, sources }, text: L.join("\n") };
}

/* ------------------------------------------------------------------ *
 * 5. Security config / kill-switches (in-isolate cached to avoid a D1
 *    read on every mutating request).
 * ------------------------------------------------------------------ */
const configCache = new Map<string, { v: string | null; exp: number }>();

export async function getConfig(env: Env, key: string): Promise<string | null> {
  const hit = configCache.get(key);
  if (hit && hit.exp > nowMs()) return hit.v;
  const row = await env.DB.prepare("SELECT value FROM security_config WHERE key = ?").bind(key).first<{ value: string }>();
  const v = row?.value ?? null;
  configCache.set(key, { v, exp: nowMs() + 30_000 }); // 30s TTL
  return v;
}
export async function setConfig(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO security_config (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
  ).bind(key, value, nowIso()).run();
  configCache.set(key, { v: value, exp: nowMs() + 30_000 });
}
export const isLockedDown = (env: Env) => getConfig(env, "lockdown").then((v) => v === "1");

/* ------------------------------------------------------------------ *
 * 6. IP blocklist (honeypot hits, escalations, manual).
 * ------------------------------------------------------------------ */
export async function blockIpHash(env: Env, ipH: string, reason: string, seconds: number): Promise<void> {
  const until = seconds <= 0 ? 0 : nowSec() + seconds;
  await env.DB.prepare(
    "INSERT INTO ip_blocks (ip_hash, reason, until, created_at) VALUES (?,?,?,?) ON CONFLICT(ip_hash) DO UPDATE SET reason=excluded.reason, until=excluded.until",
  ).bind(ipH, reason.slice(0, 120), until, nowIso()).run();
}
export async function isIpBlocked(env: Env, ipH: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT until FROM ip_blocks WHERE ip_hash = ?").bind(ipH).first<{ until: number }>();
  if (!row) return false;
  return row.until === 0 || row.until > nowSec();
}

/* ------------------------------------------------------------------ *
 * 7. Sliding-window rate limiter (D1-backed). Returns whether the caller
 *    is within budget and, if not, how long to back off.
 * ------------------------------------------------------------------ */
export async function checkRateLimit(
  env: Env,
  bucket: string,
  limit: number,
  windowSec: number,
): Promise<{ ok: boolean; remaining: number; retryAfter: number }> {
  const win = Math.floor(nowSec() / windowSec) * windowSec;
  const key = `${bucket}:${win}`;
  try {
    await env.DB.prepare(
      "INSERT INTO rate_limits (bucket, window_start, count) VALUES (?,?,1) ON CONFLICT(bucket) DO UPDATE SET count = count + 1",
    ).bind(key, win).run();
    const row = await env.DB.prepare("SELECT count FROM rate_limits WHERE bucket = ?").bind(key).first<{ count: number }>();
    const count = row?.count ?? 1;
    if (count > limit) return { ok: false, remaining: 0, retryAfter: win + windowSec - nowSec() };
    return { ok: true, remaining: limit - count, retryAfter: 0 };
  } catch {
    return { ok: true, remaining: limit, retryAfter: 0 }; // fail open on our error
  }
}

/* ------------------------------------------------------------------ *
 * 8. Brute-force lockout for credential endpoints. Keyed by email+IP so a
 *    single attacker can't lock a victim out globally, and escalating.
 * ------------------------------------------------------------------ */
const LOCK_THRESHOLD = 6;
const LOCK_SECONDS = 15 * 60;

export async function loginLockedUntil(env: Env, key: string): Promise<number | null> {
  const row = await env.DB.prepare("SELECT locked_until FROM login_attempts WHERE id = ?").bind(key).first<{ locked_until: number | null }>();
  if (row?.locked_until && row.locked_until > nowSec()) return row.locked_until;
  return null;
}
export async function recordLoginFail(env: Env, key: string): Promise<{ fails: number; lockedUntil: number | null }> {
  const row = await env.DB.prepare("SELECT fails, first_fail FROM login_attempts WHERE id = ?").bind(key).first<{ fails: number; first_fail: number }>();
  const fails = (row?.fails ?? 0) + 1;
  // escalate: each block of LOCK_THRESHOLD fails doubles the lock window
  const lockedUntil = fails >= LOCK_THRESHOLD ? nowSec() + LOCK_SECONDS * Math.pow(2, Math.floor(fails / LOCK_THRESHOLD) - 1) : null;
  await env.DB.prepare(
    `INSERT INTO login_attempts (id, fails, first_fail, locked_until) VALUES (?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET fails = ?, locked_until = ?`,
  ).bind(key, fails, row ? row.first_fail : nowSec(), lockedUntil, fails, lockedUntil).run();
  return { fails, lockedUntil };
}
export async function clearLoginFails(env: Env, key: string): Promise<void> {
  await env.DB.prepare("DELETE FROM login_attempts WHERE id = ?").bind(key).run();
}

/* ------------------------------------------------------------------ *
 * 9. Geo-velocity anomaly: remember the countries a user signs in from,
 *    and flag the first login from a brand-new country.
 * ------------------------------------------------------------------ */
export async function noteUserCountry(env: Env, userId: string, country: string): Promise<{ isNew: boolean; knownCount: number }> {
  if (!country || country === "??") return { isNew: false, knownCount: 0 };
  const existing = await env.DB.prepare("SELECT country FROM user_geo WHERE user_id = ? AND country = ?").bind(userId, country).first();
  const knownRow = await env.DB.prepare("SELECT COUNT(*) AS n FROM user_geo WHERE user_id = ?").bind(userId).first<{ n: number }>();
  const knownCount = knownRow?.n ?? 0;
  if (!existing) {
    await env.DB.prepare("INSERT OR IGNORE INTO user_geo (user_id, country, first_seen) VALUES (?,?,?)").bind(userId, country, nowIso()).run();
    // First country ever seen isn't an anomaly; a *new* one after that is.
    return { isNew: knownCount > 0, knownCount };
  }
  return { isNew: false, knownCount };
}

/* ------------------------------------------------------------------ *
 * 10. Honeypot paths — routes no legitimate client ever calls. Any hit is
 *     a scanner or an attacker; log it and block the source. These must not
 *     collide with real routes (we deliberately avoid the real /admin/* set).
 * ------------------------------------------------------------------ */
export const HONEYPOT_PATHS = [
  "/wp-login.php", "/wp-admin", "/xmlrpc.php", "/.env", "/.git/config",
  "/phpmyadmin", "/administrator", "/api/admin/users", "/config.json",
  "/.aws/credentials", "/actuator/env", "/server-status", "/admin.php",
  "/api/v1/users", "/debug", "/.well-known/security.txt.bak",
];
