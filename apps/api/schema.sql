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
