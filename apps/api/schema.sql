-- BudgetSmart central accounts (Cloudflare D1 / SQLite).
-- Source of truth for identity + subscription entitlement.

CREATE TABLE IF NOT EXISTS users (
  id                  TEXT PRIMARY KEY,
  email               TEXT NOT NULL UNIQUE,          -- stored lowercased
  password_hash       TEXT NOT NULL,                 -- pbkdf2$iter$salt$hash
  name                TEXT NOT NULL DEFAULT '',
  email_verified      INTEGER NOT NULL DEFAULT 0,    -- 0/1
  tier                TEXT NOT NULL DEFAULT 'base',  -- base | ind_t1..3 | fam_t1..3
  stripe_customer_id  TEXT,
  subscription_id     TEXT,
  subscription_status TEXT,                          -- active | past_due | canceled | ...
  current_period_end  INTEGER,                       -- unix seconds
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);

-- One-time tokens for email verification and password reset.
CREATE TABLE IF NOT EXISTS email_tokens (
  token       TEXT PRIMARY KEY,      -- random url-safe
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL,         -- 'verify' | 'reset'
  expires_at  INTEGER NOT NULL,      -- unix seconds
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_tokens(user_id);

-- Idempotency guard so a Stripe webhook event is only applied once.
CREATE TABLE IF NOT EXISTS processed_events (
  id           TEXT PRIMARY KEY,     -- Stripe event id
  created_at   TEXT NOT NULL
);

-- Family groups: an owner on a Family tier shares entitlement with up to 5 people.
CREATE TABLE IF NOT EXISTS families (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_families_owner ON families(owner_id);

-- Per-family seat cap. Family tiers stay at the default 5; a redeemed Custom /
-- Enterprise code raises its team's cap here (kept as a companion table so the
-- families schema stays additive — no ALTER on the live table).
CREATE TABLE IF NOT EXISTS family_seat_limits (
  family_id   TEXT PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
  seat_limit  INTEGER NOT NULL DEFAULT 5
);

CREATE TABLE IF NOT EXISTS family_members (
  family_id   TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member',   -- owner | member
  joined_at   TEXT NOT NULL,
  PRIMARY KEY (family_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_family_members_user ON family_members(user_id);

CREATE TABLE IF NOT EXISTS family_invites (
  id           TEXT PRIMARY KEY,
  token        TEXT NOT NULL UNIQUE,
  family_id    TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_email     TEXT NOT NULL,                   -- lowercased
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | revoked
  created_at   TEXT NOT NULL,
  expires_at   INTEGER NOT NULL                 -- unix seconds
);
CREATE INDEX IF NOT EXISTS idx_family_invites_family ON family_invites(family_id);
CREATE INDEX IF NOT EXISTS idx_family_invites_email ON family_invites(to_email);

-- Per-member financial snapshots (compact JSON the member's app computes
-- locally and pushes). Powers the owner's Master tab: one card per member.
CREATE TABLE IF NOT EXISTS family_snapshots (
  family_id   TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data        TEXT NOT NULL,     -- JSON: net worth, cashflow, budgets, goals…
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (family_id, user_id)
);

-- Custom / Enterprise plan orders. A submission (not a checkout): the API
-- scans the picked features, prices them by step band and emails a receipt.
-- Once paid it's fulfilled into a redemption code (see below).
CREATE TABLE IF NOT EXISTS plan_orders (
  ref            TEXT PRIMARY KEY,               -- human ref e.g. BS-7Q4K2P
  plan_type      TEXT NOT NULL,                  -- custom | enterprise
  contact_name   TEXT NOT NULL DEFAULT '',
  contact_email  TEXT NOT NULL,                  -- lowercased
  seats          INTEGER NOT NULL,
  item_count     INTEGER NOT NULL,
  items          TEXT NOT NULL,                  -- JSON array of feature keys
  per_person     INTEGER NOT NULL,              -- USD/person/yr (band price)
  amount_cents   INTEGER NOT NULL,              -- annual total, cents
  status         TEXT NOT NULL DEFAULT 'receipt_sent', -- receipt_sent | paid | fulfilled | canceled
  code           TEXT,                           -- set once fulfilled
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plan_orders_email ON plan_orders(contact_email);
CREATE INDEX IF NOT EXISTS idx_plan_orders_status ON plan_orders(status);

-- Redeemable codes. A code grants a tier + a seat count; the redeemer becomes
-- the owner and shares it by email (same mechanism as Family plans).
CREATE TABLE IF NOT EXISTS redemption_codes (
  code         TEXT PRIMARY KEY,                 -- uppercased, e.g. BSMART-XXXX-XXXX
  kind         TEXT NOT NULL,                    -- custom | enterprise | gift
  tier         TEXT NOT NULL,                    -- tier id granted on redeem
  seats        INTEGER NOT NULL DEFAULT 1,       -- people incl. owner (>1 => shareable team)
  features     TEXT,                             -- JSON array of purchased feature keys (custom/enterprise)
  order_ref    TEXT,                             -- plan_orders.ref that produced it (if any)
  status       TEXT NOT NULL DEFAULT 'unredeemed', -- unredeemed | active | revoked
  redeemed_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  redeemed_at  TEXT,
  expires_at   INTEGER,                          -- unix seconds; access good through here
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_order ON redemption_codes(order_ref);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_redeemed_by ON redemption_codes(redeemed_by);

-- ================================================================== --
-- Security layer (see src/security.ts). All additive.                --
-- ================================================================== --

-- Append-only security event log (SIEM seed). The app never UPDATEs or
-- DELETEs rows here — it is the tamper-evident audit trail.
CREATE TABLE IF NOT EXISTS security_events (
  id         TEXT PRIMARY KEY,
  ts         INTEGER NOT NULL,           -- unix ms
  severity   TEXT NOT NULL,              -- info | warn | high | critical
  type       TEXT NOT NULL,              -- login_fail | lockout | ratelimit | honeypot | new_country | ...
  ip_hash    TEXT,                       -- salted HMAC of client IP (for privacy-preserving correlation)
  country    TEXT,
  user_id    TEXT,
  path       TEXT,
  detail     TEXT,                       -- JSON (capped)
  created_at TEXT NOT NULL,
  -- Evidence fields (for incident response / law-enforcement referral). Raw
  -- source IP + geolocation are retained on SECURITY events only (attacker /
  -- abuse activity), never on normal user activity.
  ip         TEXT,                       -- raw source IP (Cloudflare cf-connecting-ip)
  asn        INTEGER,                    -- autonomous system number (identifies the ISP)
  as_org     TEXT,                       -- ISP / hosting-provider name
  city       TEXT,
  region     TEXT,
  timezone   TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_secevents_ts ON security_events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_secevents_type ON security_events(type, ts DESC);

-- Sliding-window rate-limit counters (bucket = "scope:window").
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket        TEXT PRIMARY KEY,
  window_start  INTEGER NOT NULL,
  count         INTEGER NOT NULL DEFAULT 0
);

-- Brute-force lockout state, keyed by email+ip hash.
CREATE TABLE IF NOT EXISTS login_attempts (
  id           TEXT PRIMARY KEY,
  fails        INTEGER NOT NULL DEFAULT 0,
  first_fail   INTEGER NOT NULL,
  locked_until INTEGER
);

-- IP blocklist (honeypot hits, escalations, manual blocks).
CREATE TABLE IF NOT EXISTS ip_blocks (
  ip_hash     TEXT PRIMARY KEY,
  reason      TEXT NOT NULL,
  until       INTEGER NOT NULL,          -- unix seconds (0 = permanent)
  created_at  TEXT NOT NULL
);

-- Kill-switches and small security state (lockdown flag, alert throttles).
CREATE TABLE IF NOT EXISTS security_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Per-user countries seen (geo-velocity anomaly detection).
CREATE TABLE IF NOT EXISTS user_geo (
  user_id    TEXT NOT NULL,
  country    TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  PRIMARY KEY (user_id, country)
);
