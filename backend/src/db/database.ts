import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../env.js";

/* ------------------------------------------------------------------ *
 * Minimal typing for node:sqlite (Node 24 built-in). We load it via
 * createRequire and describe only what we use, so the build never
 * depends on @types/node shipping node:sqlite definitions.
 * ------------------------------------------------------------------ */
export interface SqliteStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
}
export interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}
interface NodeSqlite {
  DatabaseSync: new (filename: string, options?: { open?: boolean }) => SqliteDatabase;
}

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as NodeSqlite;

/* ------------------------------------------------------------------ *
 * Resolve the database file (default: backend/data/app.db)
 * ------------------------------------------------------------------ */
function resolveDbFile(): string {
  const here = path.dirname(fileURLToPath(import.meta.url)); // backend/src/db
  const fromEnv = process.env.DATABASE_FILE;
  const file = fromEnv
    ? path.resolve(here, "..", "..", fromEnv)
    : path.resolve(here, "..", "..", "data", "app.db");
  mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

export const DB_FILE = resolveDbFile();

export const db: SqliteDatabase = new DatabaseSync(DB_FILE);
// NOTE: stay on the default rollback journal (DELETE), NOT WAL. This repo lives on
// FAT32, where WAL's memory-mapped -shm file is unreliable and left the on-disk db
// in a stale/partial state across processes. DELETE mode writes straight to app.db.
db.exec("PRAGMA journal_mode = DELETE;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA synchronous = FULL;");

/* ------------------------------------------------------------------ *
 * Schema. Money is INTEGER cents; booleans are 0/1; enums are TEXT.
 * `createdAt` is an ISO string.
 * ------------------------------------------------------------------ */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  passwordHash  TEXT NOT NULL,
  name          TEXT NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'USD',
  tier          TEXT NOT NULL DEFAULT 'base',
  createdAt     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id              TEXT PRIMARY KEY,
  userId          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,
  openingBalance  INTEGER NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'USD',
  archived        INTEGER NOT NULL DEFAULT 0,
  createdAt       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(userId);

CREATE TABLE IF NOT EXISTS categories (
  id         TEXT PRIMARY KEY,
  userId     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL,
  icon       TEXT NOT NULL DEFAULT '💸',
  color      TEXT NOT NULL DEFAULT '#00FF41',
  rollover   TEXT NOT NULL DEFAULT 'none',
  hidden     INTEGER NOT NULL DEFAULT 0,
  createdAt  TEXT NOT NULL,
  UNIQUE(userId, name)
);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(userId);

CREATE TABLE IF NOT EXISTS transactions (
  id                 TEXT PRIMARY KEY,
  userId             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accountId          TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  transferAccountId  TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  categoryId         TEXT REFERENCES categories(id) ON DELETE SET NULL,
  type               TEXT NOT NULL,
  amount             INTEGER NOT NULL,
  merchant           TEXT NOT NULL DEFAULT '',
  note               TEXT,
  date               TEXT NOT NULL,
  pending            INTEGER NOT NULL DEFAULT 0,
  excluded           INTEGER NOT NULL DEFAULT 0,
  tags               TEXT NOT NULL DEFAULT '[]',
  createdAt          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(userId, date);
CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(accountId);
CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(categoryId);

CREATE TABLE IF NOT EXISTS budgets (
  id          TEXT PRIMARY KEY,
  userId      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  categoryId  TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month       TEXT NOT NULL,
  "limit"     INTEGER NOT NULL,
  createdAt   TEXT NOT NULL,
  UNIQUE(userId, categoryId, month)
);
CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets(userId, month);

CREATE TABLE IF NOT EXISTS goals (
  id                  TEXT PRIMARY KEY,
  userId              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  type                TEXT NOT NULL DEFAULT 'savings',
  icon                TEXT NOT NULL DEFAULT '🎯',
  color               TEXT NOT NULL DEFAULT '#00FF41',
  targetAmount        INTEGER NOT NULL,
  currentAmount       INTEGER NOT NULL DEFAULT 0,
  targetDate          TEXT,
  monthlyContribution INTEGER NOT NULL DEFAULT 0,
  note                TEXT,
  priority            INTEGER NOT NULL DEFAULT 0,
  createdAt           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(userId);

CREATE TABLE IF NOT EXISTS debts (
  id              TEXT PRIMARY KEY,
  userId          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'credit_card',
  icon            TEXT NOT NULL DEFAULT '💳',
  color           TEXT NOT NULL DEFAULT '#FF0033',
  balance         INTEGER NOT NULL,
  aprBps          INTEGER NOT NULL DEFAULT 0,
  minimumPayment  INTEGER NOT NULL DEFAULT 0,
  createdAt       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_debts_user ON debts(userId);

CREATE TABLE IF NOT EXISTS holdings (
  id            TEXT PRIMARY KEY,
  userId        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  symbol        TEXT NOT NULL DEFAULT '',
  assetClass    TEXT NOT NULL DEFAULT 'stock',
  accountLabel  TEXT NOT NULL DEFAULT 'Brokerage',
  quantity      REAL NOT NULL DEFAULT 0,
  costBasis     INTEGER NOT NULL DEFAULT 0,
  currentPrice  INTEGER NOT NULL DEFAULT 0,
  createdAt     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_holdings_user ON holdings(userId);

CREATE TABLE IF NOT EXISTS family_members (
  id         TEXT PRIMARY KEY,
  ownerId    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'child',
  color      TEXT NOT NULL DEFAULT '#00FF41',
  createdAt  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_family_members_owner ON family_members(ownerId);

CREATE TABLE IF NOT EXISTS family_ledger (
  id         TEXT PRIMARY KEY,
  ownerId    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memberId   TEXT NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  note       TEXT,
  date       TEXT NOT NULL,
  createdAt  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_family_ledger_member ON family_ledger(memberId);

CREATE TABLE IF NOT EXISTS family_chores (
  id         TEXT PRIMARY KEY,
  ownerId    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memberId   TEXT NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  reward     INTEGER NOT NULL,
  repeats    INTEGER NOT NULL DEFAULT 0,
  timesDone  INTEGER NOT NULL DEFAULT 0,
  lastDoneAt TEXT,
  createdAt  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_family_chores_owner ON family_chores(ownerId);

CREATE TABLE IF NOT EXISTS family_requests (
  id         TEXT PRIMARY KEY,
  ownerId    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memberId   TEXT NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  note       TEXT,
  createdAt  TEXT NOT NULL,
  resolvedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_family_requests_owner ON family_requests(ownerId);

-- User overrides for recurring detection: force a merchant in ("always")
-- or out ("never") of recurring/bills/forecast.
CREATE TABLE IF NOT EXISTS recurring_overrides (
  userId    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key       TEXT NOT NULL,
  mode      TEXT NOT NULL,
  merchant  TEXT,
  cadence   TEXT,
  amount    INTEGER,
  createdAt TEXT NOT NULL,
  PRIMARY KEY (userId, key)
);

-- Append-only audit trail: every successful mutating API action.
CREATE TABLE IF NOT EXISTS audit_log (
  id        TEXT PRIMARY KEY,
  userId    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method    TEXT NOT NULL,
  path      TEXT NOT NULL,
  status    INTEGER NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_user_time ON audit_log(userId, createdAt DESC);

-- Opt-in monthly email digest (sent via the central API from the bot Gmail).
CREATE TABLE IF NOT EXISTS email_prefs (
  userId        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  monthlyEmail  INTEGER NOT NULL DEFAULT 0,
  lastSentMonth TEXT
);

-- Link between this local account and the central BudgetSmart account (web).
-- The central account is the source of truth for the subscription tier; on
-- reload the app re-syncs the tier from it.
CREATE TABLE IF NOT EXISTS central_link (
  userId        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  token         TEXT NOT NULL,
  tier          TEXT NOT NULL DEFAULT 'base',
  status        TEXT,
  syncedAt      TEXT NOT NULL,
  centralUserId TEXT,
  entToken      TEXT
);
`;

/** Add a column to an existing table if it's missing (idempotent). */
function ensureColumn(table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

/** Create all tables if they don't exist, then run lightweight migrations. */
export function initSchema(): void {
  db.exec(SCHEMA);
  // Migrations for databases created before a column existed.
  ensureColumn("users", "tier", "tier TEXT NOT NULL DEFAULT 'base'");
  // Remap legacy tier ids to the current plan structure (free/custom were removed).
  db.exec("UPDATE users SET tier = 'base' WHERE tier = 'free'");
  db.exec("UPDATE users SET tier = 'fam_t3' WHERE tier = 'custom'");
  // Entitlement-token columns for the account link (added after first ship).
  ensureColumn("central_link", "centralUserId", "centralUserId TEXT");
  ensureColumn("central_link", "entToken", "entToken TEXT");
  // Budget sub-categories (nullable parent).
  ensureColumn("categories", "parentId", "parentId TEXT");
  // Weekly email digest opt-in (added after monthly shipped).
  ensureColumn("email_prefs", "weeklyEmail", "weeklyEmail INTEGER NOT NULL DEFAULT 0");
  ensureColumn("email_prefs", "lastSentWeek", "lastSentWeek TEXT");
  // Shared (family) goals — members contribute from their wallets.
  ensureColumn("goals", "shared", "shared INTEGER NOT NULL DEFAULT 0");
}

initSchema();

export const newId = (): string => globalThis.crypto.randomUUID();
export const nowIso = (): string => new Date().toISOString();
export const boolToInt = (b: boolean): number => (b ? 1 : 0);
export const intToBool = (n: unknown): boolean => n === 1 || n === true;
