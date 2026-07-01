// On-device SQLite for the mobile app. Wraps sql.js (WASM SQLite) in the SAME
// synchronous interface the backend's repo expects, so the repo/serialize logic
// is reused verbatim. Persisted to the Capacitor filesystem.
import { Directory, Filesystem, Encoding } from "@capacitor/filesystem";
import initSqlJs, { type Database as SqlJsDb } from "sql.js";

export interface SqliteStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number };
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
}
export interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

const DB_FILE = "budgetsmart.sqlite";

class SqlJsStatement implements SqliteStatement {
  constructor(private db: SqlJsDb, private sql: string) {}
  run(...params: unknown[]) {
    this.db.run(this.sql, params as never);
    scheduleSave();
    return { changes: this.db.getRowsModified(), lastInsertRowid: 0 };
  }
  get(...params: unknown[]) {
    const stmt = this.db.prepare(this.sql);
    stmt.bind(params as never);
    const row = stmt.step() ? (stmt.getAsObject() as Record<string, unknown>) : undefined;
    stmt.free();
    return row;
  }
  all(...params: unknown[]) {
    const stmt = this.db.prepare(this.sql);
    stmt.bind(params as never);
    const out: Record<string, unknown>[] = [];
    while (stmt.step()) out.push(stmt.getAsObject() as Record<string, unknown>);
    stmt.free();
    return out;
  }
}

class SqlJsDatabase implements SqliteDatabase {
  constructor(private db: SqlJsDb) {}
  exec(sql: string) { this.db.run(sql); }
  prepare(sql: string) { return new SqlJsStatement(this.db, sql); }
  close() { this.db.close(); }
  export() { return this.db.export(); }
}

/* ------------------------------------------------------------------ *
 * Schema (mirrors the backend). Money is INTEGER cents; bools are 0/1.
 * ------------------------------------------------------------------ */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, passwordHash TEXT NOT NULL,
  name TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'USD', tier TEXT NOT NULL DEFAULT 'base', createdAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY, userId TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
  openingBalance INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'USD', archived INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY, userId TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '💸', color TEXT NOT NULL DEFAULT '#00FF41', rollover TEXT NOT NULL DEFAULT 'none',
  hidden INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL, UNIQUE(userId, name));
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY, userId TEXT NOT NULL, accountId TEXT NOT NULL, transferAccountId TEXT, categoryId TEXT,
  type TEXT NOT NULL, amount INTEGER NOT NULL, merchant TEXT NOT NULL DEFAULT '', note TEXT, date TEXT NOT NULL,
  pending INTEGER NOT NULL DEFAULT 0, excluded INTEGER NOT NULL DEFAULT 0, tags TEXT NOT NULL DEFAULT '[]', createdAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY, userId TEXT NOT NULL, categoryId TEXT NOT NULL, month TEXT NOT NULL,
  "limit" INTEGER NOT NULL, createdAt TEXT NOT NULL, UNIQUE(userId, categoryId, month));
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY, userId TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'savings',
  icon TEXT NOT NULL DEFAULT '🎯', color TEXT NOT NULL DEFAULT '#00FF41', targetAmount INTEGER NOT NULL,
  currentAmount INTEGER NOT NULL DEFAULT 0, targetDate TEXT, monthlyContribution INTEGER NOT NULL DEFAULT 0,
  note TEXT, priority INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS debts (
  id TEXT PRIMARY KEY, userId TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'credit_card',
  icon TEXT NOT NULL DEFAULT '💳', color TEXT NOT NULL DEFAULT '#FF0033', balance INTEGER NOT NULL,
  aprBps INTEGER NOT NULL DEFAULT 0, minimumPayment INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS holdings (
  id TEXT PRIMARY KEY, userId TEXT NOT NULL, name TEXT NOT NULL, symbol TEXT NOT NULL DEFAULT '',
  assetClass TEXT NOT NULL DEFAULT 'stock', accountLabel TEXT NOT NULL DEFAULT 'Brokerage', quantity REAL NOT NULL DEFAULT 0,
  costBasis INTEGER NOT NULL DEFAULT 0, currentPrice INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS family_members (
  id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'child',
  color TEXT NOT NULL DEFAULT '#00FF41', createdAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS family_ledger (
  id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, memberId TEXT NOT NULL, kind TEXT NOT NULL,
  amount INTEGER NOT NULL, note TEXT, date TEXT NOT NULL, createdAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS central_link (
  userId TEXT PRIMARY KEY, email TEXT NOT NULL, token TEXT NOT NULL, tier TEXT NOT NULL DEFAULT 'base',
  status TEXT, syncedAt TEXT NOT NULL, centralUserId TEXT, entToken TEXT);
`;

let _db: SqlJsDatabase | null = null;
let _raw: SqlJsDb | null = null;

/** The singleton db (throws if used before initDb()). */
export const db: SqliteDatabase = new Proxy({} as SqliteDatabase, {
  get(_t, prop) {
    if (!_db) throw new Error("db not initialised");
    return (_db as never as Record<string, unknown>)[prop as string];
  },
});

export async function initDb(): Promise<void> {
  if (_db) return;
  const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
  let bytes: Uint8Array | undefined;
  try {
    const res = await Filesystem.readFile({ path: DB_FILE, directory: Directory.Data });
    bytes = Uint8Array.from(atob(res.data as string), (c) => c.charCodeAt(0));
  } catch {
    /* first run — no db yet */
  }
  _raw = bytes ? new SQL.Database(bytes) : new SQL.Database();
  _raw.run("PRAGMA foreign_keys = ON;");
  _raw.run(SCHEMA);
  _db = new SqlJsDatabase(_raw);
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}
export async function saveNow(): Promise<void> {
  if (!_raw) return;
  const bytes = _raw.export();
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  await Filesystem.writeFile({ path: DB_FILE, directory: Directory.Data, data: btoa(bin), encoding: undefined });
}

/* helpers mirroring the backend's database.ts */
export const newId = (): string => globalThis.crypto.randomUUID();
export const nowIso = (): string => new Date().toISOString();
export const boolToInt = (b: boolean): number => (b ? 1 : 0);
export const intToBool = (n: unknown): boolean => n === 1 || n === true;

void Encoding; // keep import (writeFile uses base64 when encoding omitted)
