# BudgetSmart Security Architecture

**Owner:** Tech Myriad Emporium LLC (Ohio) · **Scope:** the central account/entitlement Worker (`budgetsmart-api`) and its data (D1/R2), plus the marketing site.
**Last updated:** 2026-07-08.

## Honest posture (read this first)

This is an aggressive, layered, defense-in-depth program built to make an attack **noisy, expensive, contained, and logged**. It is **not** — and no system is — provably unbreakable. Where a claim would be false (e.g., "impenetrable," or a certification we don't hold), this document says so plainly. Security here is *risk reduction with evidence*, and every control below is either **BUILT** (code, deployed, tested), **CONFIG** (a Cloudflare dashboard action with exact steps), **PROCESS** (a documented human procedure), or **FUTURE** (unlocks when the online re-platform / bank integrations exist).

The threat model assumes skilled, persistent, resourced attackers, and treats every external connection and internal component as hostile until proven otherwise.

---

## What is BUILT and live right now (code, deployed, attack-tested)

All of the following ship in `apps/api/src/security.ts` + `index.ts`, are deployed to production, and are covered by the adversarial test suite (`apps/api/scripts/attack-suite.mjs`, **26/26 passing** against the live deployment as of 2026-07-08).

| Control | How it works |
|---|---|
| **Security response headers** | HSTS (2yr, preload), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, locked `Content-Security-Policy` (`default-src 'none'`), `Referrer-Policy: no-referrer`, COOP/CORP, `Permissions-Policy`, `x-powered-by` stripped. Applied to every response. |
| **Brute-force lockout** | Per-`(email,ip)` failed-login tracking with an escalating lock (6 fails → 15 min, doubling each further block). Proven live: account locks at attempt 7. |
| **Rate limiting** | Sliding-window D1 limiter on every abuse-prone endpoint: login (20/IP/15m), register (8/IP/hr), resend (5/IP/hr), orders (6/IP/hr), code-redeem (12/user/hr), 2FA-verify (10/user/5m). Returns `429` + `Retry-After`. |
| **IP reputation / blocklist** | Salted-hash IP blocklist checked on all mutating requests; tripping a honeypot auto-blocks the source for 24h. |
| **Honeypots** | `/.env`, `/wp-login.php`, `/.git/config`, `/phpmyadmin`, `/actuator/env`, `/.aws/credentials`, etc. — any hit is logged `high` and the source is blocked. Early-warning for scanners. |
| **Append-only security event log (SIEM seed)** | `security_events` table: severity, type, salted IP hash, country, user, path, JSON detail. The app never UPDATEs/DELETEs it. |
| **Evidence log + law-enforcement report** | Security events additionally retain the **raw source IP, ASN, ISP/org name, city/region, timezone and user-agent** (on attacker/abuse events only). `GET /admin/security/report?format=text` produces a paste-ready incident report grouped by source IP with the ISP attribution police need to subpoena the subscriber. Geolocation is labeled approximate (VPN/Tor/proxy). |
| **Attack-alert email + compromise assessment** | High/critical events trigger an automated email that states plainly whether it was a **blocked attack (accounts secure)** or a **successful access from a new location (may be compromised)**, with the full source trace. Throttled (5 min for compromise, 30 min for blocked) so a flood can't spam the inbox. |
| **Geo-velocity anomaly detection** | Remembers each user's sign-in countries; a login from a **new** country logs `critical`, emails the operator (throttled), and notifies the user. |
| **Field-level encryption at rest** | AES-256-GCM helper (`encryptField`/`decryptField`), key derived from `JWT_SECRET` via SHA-256 (no new secret). Applied to **TOTP secrets** — self-describing `enc:v1:` ciphertext with backward-compatible reads of any legacy plaintext. |
| **Lockdown kill-switch** | `POST /admin/security/lockdown {on:true}` freezes all writes (503) except the admin console and the Stripe webhook — one call to contain an active incident. |
| **Admin IR console** | Token-gated `GET /admin/security/status` (24h triage rollup), `GET /admin/security/events`, `POST /admin/security/block`, `POST /admin/security/lockdown`. |
| **Strong auth primitives (pre-existing, verified)** | PBKDF2 password hashing (100k iters, constant-time compare), RS256-signed entitlement tokens, HS256 sessions, TOTP 2FA, Stripe webhook HMAC verification, CORS locked to the domain, admin endpoints behind a secret token, card data never touches our systems (Stripe). |
| **Fail-safe design** | Logging/alerting failures never break the request (fail-open on our own errors); detected attacker signals fail-closed (block). |

**Run the tests yourself:** `node apps/api/scripts/attack-suite.mjs` (header checks, auth/authz bypass, SQLi, brute-force lockout, admin gating, malformed/oversized bodies, JWT tampering, CORS, honeypot→block). It deliberately trips defenses and is safe to re-run; reset the `ip_blocks`/`login_attempts`/`rate_limits` tables afterward if you run it against prod.

---

## Mapping to the 18-layer spec you requested

| # | Requested layer | Status | Notes |
|---|---|---|---|
| 1 | Next-gen firewall / DPI / geo / IP reputation / TLS termination / anomaly | **CONFIG + BUILT** | TLS termination, DDoS, DPI-class filtering and geo are **Cloudflare edge** (checklist below). IP reputation + anomaly + rate-limit are BUILT in-app. |
| 2 | Segmented network (prod/stage/dev, micro-segmentation) | **CONFIG/PROCESS** | Separate Cloudflare Workers + separate D1/R2 per environment; least-privilege API tokens. Serverless model removes lateral-movement surface (no shared VMs). |
| 3 | Secure API perimeter (authN/Z, schema validation, replay, signing, rate limit, threat filtering) | **BUILT** | AuthN/Z, rate limiting, input validation, signed entitlements, webhook signature verification, injection-safe parameterized queries — all live. Request signing for partner APIs is FUTURE. |
| 4 | Deep application-layer defense (input validation, session mgmt, CSRF, hardened flows for money/identity) | **BUILT (today) + FUTURE (money)** | Server-side validation, hardened 2FA-gated sensitive actions, no cookie-based CSRF surface (bearer tokens). Money-movement step-up auth is FUTURE (no money movement yet). |
| 5 | Multi-tier data protection (field encryption, fine-grained access, query profiling, exfil alerts) | **BUILT (partial)** | Field-level encryption live (TOTP). Bulk-export/exfil alerting is BUILT for code redemption; broader query profiling is FUTURE. |
| 6 | Behavioral IDS/IPS (baselines, escalation) | **BUILT (seed)** | Geo-velocity + rate/lockout escalation (alert→throttle→block) live; full behavioral baselining is FUTURE + Cloudflare Bot Management. |
| 7 | Data loss prevention | **CONFIG/FUTURE** | Cloudflare outbound rules + log scrubbing (raw IPs already never logged). Full DLP needs the online datastore. |
| 8 | Continuous monitoring & observability (immutable logs, correlation, dashboards) | **BUILT** | Append-only `security_events` + admin triage rollup. Correlation/dashboards → Cloudflare Logpush to a SIEM (checklist). |
| 9 | Vendor/integration control (Plaid/Finicity/Yodlee/KYC, kill-switches) | **FUTURE** | Kill-switch pattern exists (`security_config` flags); wire per-integration switches when those integrations are built. |
| 10 | Fraud / financial anomaly engine | **FUTURE** | Depends on transactions being server-side (post re-platform) and money movement. |
| 11 | Deception / honeypots | **BUILT** | Honeypot paths live and auto-blocking. |
| 12 | Hardware-backed crypto (HSM) | **CONFIG** | Move signing keys to a KMS/HSM (Cloudflare Secrets Store / external KMS). Today keys are Worker secrets, not in code. |
| 13 | Sandboxing / isolation of risky parsing | **BUILT (by platform)** | Workers run each request in a V8 isolate with no filesystem/network ambient authority — strong default sandboxing. |
| 14 | Vulnerability management & hardening | **PROCESS** | `npm audit` in CI, Dependabot, quarterly review (checklist). |
| 15 | Config & secrets management | **BUILT/CONFIG** | Secrets are Wrangler secrets (never in code/logs); rotate on schedule. Upgrade path: Cloudflare Secrets Store. |
| 16 | Incident response & containment | **BUILT + PROCESS** | Lockdown, block, revoke, event triage are one-call operations (playbooks below). |
| 17 | Backup, recovery, continuity | **CONFIG/PROCESS** | D1 Time Travel (point-in-time restore) + scheduled exports to R2; test restores quarterly. |
| 18 | Compliance-anchored control mapping | **PROCESS** | Matrix below. |

---

## Cloudflare hardening checklist (CONFIG — dashboard actions, ~30 min)

These are the edge/NGFW-class controls that live in your Cloudflare account, not in code. Do them in the dashboard for the `budgetsmarttme.com` zone + the Worker:

1. **WAF Managed Rulesets** → enable the *Cloudflare Managed Ruleset* and *OWASP Core Ruleset* (start in *Log* mode for a week, then *Block*).
2. **Rate limiting rules** (edge, complements the in-app limiter): a blanket rule on `/auth/*` (e.g. 30 req/min/IP → managed challenge) and `/orders`, `/codes/*`.
3. **Bot Management / Super Bot Fight Mode** → challenge automated traffic; this is your behavioral-bot layer.
4. **DDoS protection** → on by default (L3/4/7); confirm *HTTP DDoS* sensitivity is High.
5. **TLS** → set **Minimum TLS 1.2** (ideally 1.3), enable *Always Use HTTPS*, HSTS (already set in-app headers too), and disable legacy ciphers.
6. **Geo rules** → only if your user base is regional. **Leave OFF unless you decide to restrict** — blanket geo-blocking locks out real users and travelers. Sanctioned-country blocking (OFAC) is the exception: add a rule blocking embargoed jurisdictions.
7. **Firewall/Security rules** → block requests with no/invalid `Host`, known-bad ASNs, and Tor exit nodes for `/admin/*` and `/auth/*`.
8. **Logpush** → stream Worker + WAF logs to R2 (or a SIEM like Datadog/Splunk) for the correlation/dashboard layer and long-term audit retention.
9. **Secrets Store / KMS** → migrate `JWT_SECRET`, `ENTITLEMENT_PRIVATE_KEY`, `STRIPE_SECRET_KEY` to Cloudflare Secrets Store; set rotation reminders.
10. **Access (Zero Trust)** → put the `/admin/*` routes behind Cloudflare Access (email OTP / SSO) in addition to the upload token — defense in depth on the console.
11. **D1 Time Travel** → confirm retention; schedule a monthly export to R2 and do a **test restore** quarterly.

---

## Compliance control matrix (PROCESS)

Ties each defense to the obligation it supports (regulator-ready evidence). Full statute citations are in `/terms` and `/privacy`.

| Control (built/config) | PCI DSS v4 | SOC 2 (TSC) | NACHA | AML/KYC | OFAC | State MTL / FinCEN |
|---|---|---|---|---|---|---|
| TLS 1.2+ everywhere, HSTS, strict ciphers | 4.2 | CC6.7 | — | — | — | — |
| WAF, rate limiting, DDoS, honeypots | 6.4, 11.5 | CC6.6, CC7.2 | — | — | — | — |
| PBKDF2 hashing, 2FA, session/token hardening | 8.3 | CC6.1 | — | CDD | — | — |
| Field-level encryption at rest (AES-GCM) | 3.5 | CC6.1 | — | — | — | — |
| Append-only event log + alerting + Logpush | 10.x | CC7.2, CC7.3 | — | monitoring | screening evidence | recordkeeping |
| Lockdown / IP block / IR console | 12.10 | CC7.4, CC7.5 | — | — | freeze on hit | SAR-support |
| Geo/sanctions edge rules | — | CC6.6 | — | — | **31 CFR 500-599** | — |
| Card data offloaded to Stripe (never stored) | scope reduction | CC6.1 | — | — | — | — |
| Secrets in vault, rotation, least-privilege tokens | 8.2, 3.6 | CC6.1, CC6.3 | — | — | — | — |
| Backups (D1 Time Travel + R2), tested restores | 12.10 | A1.2 | — | — | — | — |

Items marked FUTURE (fraud engine, per-integration kill-switches, NACHA ACH controls, money-movement step-up) attach here as those features are built. **Certifications (SOC 2 I/II, ISO 27001, PCI attestation) are not claimed until earned.**

---

## Incident-response playbooks (BUILT commands + PROCESS)

Each of these is a real, one-call operation now. Replace `$TOKEN` with your `UPLOAD_TOKEN`.

**Triage (start here):**
```
curl -s https://budgetsmart-api.budgetsmart.workers.dev/admin/security/status -H "x-upload-token: $TOKEN"
curl -s "https://budgetsmart-api.budgetsmart.workers.dev/admin/security/events?severity=high&limit=100" -H "x-upload-token: $TOKEN"
```

**Evidence report for a police referral** (raw IPs, ISP/ASN, geo, targeted accounts, timestamps — grouped by source):
```
curl -s "https://budgetsmart-api.budgetsmart.workers.dev/admin/security/report?format=text&days=7" -H "x-upload-token: $TOKEN"
```
Forward the output to law enforcement. The actionable attribution is the **ISP (ASN/org)** per source IP: police subpoena that ISP for the subscriber assigned the IP at the listed UTC timestamps. Note in your referral that IPs may be VPN/Tor/proxy relays.

**1. Suspected active breach / data exfiltration → CONTAIN immediately:**
```
# freeze all writes (reads still serve; admin + Stripe webhook stay up)
curl -s -X POST .../admin/security/lockdown -H "x-upload-token: $TOKEN" -H "content-type: application/json" -d '{"on":true}'
```
Then: rotate `JWT_SECRET` (invalidates all sessions → forces global re-auth), rotate `ENTITLEMENT_PRIVATE_KEY`, review `security_events`, restore from D1 Time Travel if data was altered. Lift with `{"on":false}`.

**2. Credential theft / account takeover:** the geo-anomaly alert fires automatically. Block the source (`POST /admin/security/block {ip, seconds}`), force the user's re-auth (they can reset password), confirm 2FA. If widespread, rotate `JWT_SECRET`.

**3. API abuse / scraping / brute force:** rate-limits + lockout handle it automatically; escalate a persistent source with a permanent block (`seconds: 0`), and tighten the Cloudflare edge rate-limit rule.

**4. Integration compromise (FUTURE — Plaid/etc):** flip that integration's `security_config` kill-switch (pattern is built), sever the connection, rotate its API keys, notify the vendor.

**Escalation:** breach affecting personal data → notify per Ohio Rev. Code § 1349.19 (and GDPR Arts. 33–34 where applicable) within statutory timelines; document in the event log.

---

## What still requires you (not code)

- **Cloudflare dashboard checklist above** (~30 min) — this is your NGFW/WAF/geo/DLP/Logpush layer.
- **A penetration test** by a third party before money-movement launch (PCI/SOC 2 both expect it). The in-house suite is not a substitute for an independent pen test.
- **The re-platform-dependent layers** (fraud engine, full DLP/query-profiling, per-integration kill-switches) get built when the online datastore and bank integrations exist.
- **SOC 2 / ISO 27001** — start the audit engagements; these controls are the evidence base, but the attestation is earned, not self-declared.
