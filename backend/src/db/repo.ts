import { boolToInt, db, newId, nowIso } from "./database.js";
import type {
  AccountRow,
  BudgetRow,
  CategoryRow,
  CentralLinkRow,
  ChoreRow,
  DebtRow,
  FamilyLedgerRow,
  FamilyMemberRow,
  FamilyRequestRow,
  GoalRow,
  RecurringOverrideRow,
  HoldingRow,
  TransactionRow,
  UserRow,
} from "./rows.js";

/** Coerce a JS value into something node:sqlite can bind. */
type Bindable = string | number | bigint | null | Uint8Array;
function p(v: unknown): Bindable {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string" || typeof v === "number" || typeof v === "bigint") return v;
  return String(v);
}
const row = <T>(r: Record<string, unknown> | undefined): T | undefined => r as T | undefined;
const rows = <T>(r: Record<string, unknown>[]): T[] => r as T[];

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */
export const users = {
  findByEmail(email: string): UserRow | undefined {
    return row<UserRow>(db.prepare("SELECT * FROM users WHERE email = ?").get(email));
  },
  findById(id: string): UserRow | undefined {
    return row<UserRow>(db.prepare("SELECT * FROM users WHERE id = ?").get(id));
  },
  create(input: { email: string; passwordHash: string; name: string; currency: string }): UserRow {
    const r: UserRow = { id: newId(), createdAt: nowIso(), tier: "base", ...input };
    db.prepare(
      "INSERT INTO users (id,email,passwordHash,name,currency,tier,createdAt) VALUES (?,?,?,?,?,?,?)",
    ).run(r.id, r.email, r.passwordHash, r.name, r.currency, r.tier, r.createdAt);
    return r;
  },
  setTier(id: string, tier: string): UserRow {
    db.prepare("UPDATE users SET tier = ? WHERE id = ?").run(tier, id);
    return row<UserRow>(db.prepare("SELECT * FROM users WHERE id = ?").get(id))!;
  },
  listAll(): UserRow[] {
    return rows<UserRow>(db.prepare("SELECT * FROM users").all());
  },
};

/* ------------------------------------------------------------------ *
 * Recurring-detection overrides (user customization)
 * ------------------------------------------------------------------ */
export const recurringOverrides = {
  list(userId: string): RecurringOverrideRow[] {
    return rows<RecurringOverrideRow>(db.prepare("SELECT * FROM recurring_overrides WHERE userId = ?").all(userId));
  },
  set(input: { userId: string; key: string; mode: string; merchant?: string | null; cadence?: string | null; amount?: number | null }): void {
    db.prepare(
      `INSERT INTO recurring_overrides (userId,key,mode,merchant,cadence,amount,createdAt) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(userId,key) DO UPDATE SET mode=excluded.mode, merchant=excluded.merchant, cadence=excluded.cadence, amount=excluded.amount`,
    ).run(input.userId, input.key, input.mode, p(input.merchant), p(input.cadence), p(input.amount), nowIso());
  },
  remove(userId: string, key: string): void {
    db.prepare("DELETE FROM recurring_overrides WHERE userId = ? AND key = ?").run(userId, key);
  },
};

/* ------------------------------------------------------------------ *
 * Email digest preferences
 * ------------------------------------------------------------------ */
export interface EmailPrefsRow {
  userId: string;
  monthlyEmail: number;
  lastSentMonth: string | null;
  weeklyEmail: number;
  lastSentWeek: string | null;
}

export const emailPrefs = {
  get(userId: string): EmailPrefsRow {
    return (
      row<EmailPrefsRow>(db.prepare("SELECT * FROM email_prefs WHERE userId = ?").get(userId)) ?? {
        userId,
        monthlyEmail: 0,
        lastSentMonth: null,
        weeklyEmail: 0,
        lastSentWeek: null,
      }
    );
  },
  setEnabled(userId: string, enabled: boolean): EmailPrefsRow {
    db.prepare(
      "INSERT INTO email_prefs (userId, monthlyEmail) VALUES (?, ?) ON CONFLICT(userId) DO UPDATE SET monthlyEmail = excluded.monthlyEmail",
    ).run(userId, boolToInt(enabled));
    return this.get(userId);
  },
  setWeeklyEnabled(userId: string, enabled: boolean): EmailPrefsRow {
    db.prepare(
      "INSERT INTO email_prefs (userId, monthlyEmail, weeklyEmail) VALUES (?, 0, ?) ON CONFLICT(userId) DO UPDATE SET weeklyEmail = excluded.weeklyEmail",
    ).run(userId, boolToInt(enabled));
    return this.get(userId);
  },
  markWeekSent(userId: string, week: string): void {
    db.prepare(
      "INSERT INTO email_prefs (userId, monthlyEmail, weeklyEmail, lastSentWeek) VALUES (?, 0, 1, ?) ON CONFLICT(userId) DO UPDATE SET lastSentWeek = excluded.lastSentWeek",
    ).run(userId, week);
  },
  markSent(userId: string, month: string): void {
    db.prepare(
      "INSERT INTO email_prefs (userId, monthlyEmail, lastSentMonth) VALUES (?, 1, ?) ON CONFLICT(userId) DO UPDATE SET lastSentMonth = excluded.lastSentMonth",
    ).run(userId, month);
  },
};

/* ------------------------------------------------------------------ *
 * Central account link (this device ↔ the web account)
 * ------------------------------------------------------------------ */
export const centralLink = {
  get(userId: string): CentralLinkRow | undefined {
    return row<CentralLinkRow>(db.prepare("SELECT * FROM central_link WHERE userId = ?").get(userId));
  },
  set(input: {
    userId: string;
    email: string;
    token: string;
    tier: string;
    status: string | null;
    centralUserId?: string | null;
    entToken?: string | null;
  }): CentralLinkRow {
    db.prepare(
      `INSERT INTO central_link (userId,email,token,tier,status,syncedAt,centralUserId,entToken) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(userId) DO UPDATE SET email=excluded.email, token=excluded.token, tier=excluded.tier, status=excluded.status, syncedAt=excluded.syncedAt, centralUserId=excluded.centralUserId, entToken=excluded.entToken`,
    ).run(input.userId, input.email, input.token, input.tier, p(input.status), nowIso(), p(input.centralUserId), p(input.entToken));
    return this.get(input.userId)!;
  },
  clear(userId: string): void {
    db.prepare("DELETE FROM central_link WHERE userId = ?").run(userId);
  },
};

/* ------------------------------------------------------------------ *
 * Accounts
 * ------------------------------------------------------------------ */
export const accounts = {
  listByUser(userId: string, opts: { activeOnly?: boolean } = {}): AccountRow[] {
    const sql = `SELECT * FROM accounts WHERE userId = ?${opts.activeOnly ? " AND archived = 0" : ""} ORDER BY createdAt ASC`;
    return rows<AccountRow>(db.prepare(sql).all(userId));
  },
  findForUser(userId: string, id: string): AccountRow | undefined {
    return row<AccountRow>(db.prepare("SELECT * FROM accounts WHERE id = ? AND userId = ?").get(id, userId));
  },
  countOwned(userId: string, ids: string[]): number {
    if (ids.length === 0) return 0;
    const placeholders = ids.map(() => "?").join(",");
    const r = db
      .prepare(`SELECT COUNT(*) AS c FROM accounts WHERE userId = ? AND id IN (${placeholders})`)
      .get(userId, ...ids);
    return Number((r as { c: number }).c);
  },
  create(input: { userId: string; name: string; type: string; openingBalance: number; currency: string }): AccountRow {
    const r: AccountRow = { id: newId(), archived: 0, createdAt: nowIso(), ...input };
    db.prepare(
      "INSERT INTO accounts (id,userId,name,type,openingBalance,currency,archived,createdAt) VALUES (?,?,?,?,?,?,?,?)",
    ).run(r.id, r.userId, r.name, r.type, r.openingBalance, r.currency, r.archived, r.createdAt);
    return r;
  },
  update(
    id: string,
    patch: Partial<{ name: string; type: string; openingBalance: number; currency: string; archived: boolean }>,
  ): AccountRow {
    applyUpdate("accounts", id, patch);
    return row<AccountRow>(db.prepare("SELECT * FROM accounts WHERE id = ?").get(id))!;
  },
  remove(id: string): void {
    db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
  },
};

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */
export const categories = {
  listByUser(userId: string): CategoryRow[] {
    return rows<CategoryRow>(
      db.prepare("SELECT * FROM categories WHERE userId = ? ORDER BY kind ASC, name ASC").all(userId),
    );
  },
  findForUser(userId: string, id: string): CategoryRow | undefined {
    return row<CategoryRow>(db.prepare("SELECT * FROM categories WHERE id = ? AND userId = ?").get(id, userId));
  },
  findByName(userId: string, name: string): CategoryRow | undefined {
    return row<CategoryRow>(db.prepare("SELECT * FROM categories WHERE userId = ? AND name = ?").get(userId, name));
  },
  countByUser(userId: string): number {
    const r = db.prepare("SELECT COUNT(*) AS c FROM categories WHERE userId = ?").get(userId);
    return Number((r as { c: number }).c);
  },
  create(input: {
    userId: string;
    name: string;
    kind: string;
    icon: string;
    color: string;
    rollover: string;
    hidden: boolean;
    parentId?: string | null;
  }): CategoryRow {
    const r: CategoryRow = { id: newId(), createdAt: nowIso(), parentId: input.parentId ?? null, ...input, hidden: boolToInt(input.hidden) } as CategoryRow;
    db.prepare(
      "INSERT INTO categories (id,userId,name,kind,icon,color,rollover,hidden,parentId,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).run(r.id, r.userId, r.name, r.kind, r.icon, r.color, r.rollover, r.hidden, r.parentId, r.createdAt);
    return r;
  },
  createMany(list: Array<{ userId: string; name: string; kind: string; icon: string; color: string; rollover: string; hidden?: boolean }>): void {
    const stmt = db.prepare(
      "INSERT INTO categories (id,userId,name,kind,icon,color,rollover,hidden,createdAt) VALUES (?,?,?,?,?,?,?,?,?)",
    );
    const ts = nowIso();
    for (const c of list) {
      stmt.run(newId(), c.userId, c.name, c.kind, c.icon, c.color, c.rollover, boolToInt(c.hidden ?? false), ts);
    }
  },
  update(
    id: string,
    patch: Partial<{ name: string; kind: string; icon: string; color: string; rollover: string; hidden: boolean; parentId: string | null }>,
  ): CategoryRow {
    applyUpdate("categories", id, patch);
    return row<CategoryRow>(db.prepare("SELECT * FROM categories WHERE id = ?").get(id))!;
  },
  remove(id: string): void {
    db.prepare("DELETE FROM categories WHERE id = ?").run(id);
  },
};

/* ------------------------------------------------------------------ *
 * Transactions
 * ------------------------------------------------------------------ */
export interface TxFilter {
  accountId?: string;
  categoryId?: string;
  type?: string;
  from?: string;
  to?: string;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
  tag?: string;
}

function txWhere(userId: string, f: TxFilter): { clause: string; params: Bindable[] } {
  const parts: string[] = ["userId = ?"];
  const params: Bindable[] = [userId];
  if (f.accountId) {
    parts.push("(accountId = ? OR transferAccountId = ?)");
    params.push(f.accountId, f.accountId);
  }
  if (f.categoryId) {
    parts.push("categoryId = ?");
    params.push(f.categoryId);
  }
  if (f.type) {
    parts.push("type = ?");
    params.push(f.type);
  }
  if (f.from) {
    parts.push("date >= ?");
    params.push(f.from);
  }
  if (f.to) {
    parts.push("date <= ?");
    params.push(f.to);
  }
  if (f.minAmount != null) {
    parts.push("amount >= ?");
    params.push(f.minAmount);
  }
  if (f.maxAmount != null) {
    parts.push("amount <= ?");
    params.push(f.maxAmount);
  }
  if (f.search) {
    parts.push("(merchant LIKE ? OR note LIKE ?)");
    const like = `%${f.search}%`;
    params.push(like, like);
  }
  if (f.tag) {
    parts.push("tags LIKE ?");
    params.push(`%"${f.tag}"%`);
  }
  return { clause: parts.join(" AND "), params };
}

export const transactions = {
  list(userId: string, f: TxFilter, limit: number, offset: number): TransactionRow[] {
    const { clause, params } = txWhere(userId, f);
    return rows<TransactionRow>(
      db
        .prepare(`SELECT * FROM transactions WHERE ${clause} ORDER BY date DESC, createdAt DESC LIMIT ? OFFSET ?`)
        .all(...params, limit, offset),
    );
  },
  count(userId: string, f: TxFilter): number {
    const { clause, params } = txWhere(userId, f);
    const r = db.prepare(`SELECT COUNT(*) AS c FROM transactions WHERE ${clause}`).get(...params);
    return Number((r as { c: number }).c);
  },
  allByUser(userId: string): TransactionRow[] {
    return rows<TransactionRow>(db.prepare("SELECT * FROM transactions WHERE userId = ?").all(userId));
  },
  findForUser(userId: string, id: string): TransactionRow | undefined {
    return row<TransactionRow>(
      db.prepare("SELECT * FROM transactions WHERE id = ? AND userId = ?").get(id, userId),
    );
  },
  create(input: {
    userId: string;
    accountId: string;
    transferAccountId: string | null;
    categoryId: string | null;
    type: string;
    amount: number;
    merchant: string;
    note: string | null;
    date: string;
    pending: boolean;
    excluded: boolean;
    tags: string;
  }): TransactionRow {
    const r: TransactionRow = {
      id: newId(),
      createdAt: nowIso(),
      ...input,
      pending: boolToInt(input.pending),
      excluded: boolToInt(input.excluded),
    };
    db.prepare(
      `INSERT INTO transactions
        (id,userId,accountId,transferAccountId,categoryId,type,amount,merchant,note,date,pending,excluded,tags,createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      r.id, r.userId, r.accountId, r.transferAccountId, r.categoryId, r.type, r.amount,
      r.merchant, r.note, r.date, r.pending, r.excluded, r.tags, r.createdAt,
    );
    return r;
  },
  update(
    id: string,
    patch: Partial<{
      accountId: string;
      transferAccountId: string | null;
      categoryId: string | null;
      type: string;
      amount: number;
      merchant: string;
      note: string | null;
      date: string;
      pending: boolean;
      excluded: boolean;
      tags: string;
    }>,
  ): TransactionRow {
    applyUpdate("transactions", id, patch);
    return row<TransactionRow>(db.prepare("SELECT * FROM transactions WHERE id = ?").get(id))!;
  },
  remove(id: string): void {
    db.prepare("DELETE FROM transactions WHERE id = ?").run(id);
  },
};

/* ------------------------------------------------------------------ *
 * Budgets
 * ------------------------------------------------------------------ */
export const budgets = {
  listByUserMonth(userId: string, month: string): BudgetRow[] {
    return rows<BudgetRow>(
      db.prepare('SELECT id,userId,categoryId,month,"limit",createdAt FROM budgets WHERE userId = ? AND month = ?').all(
        userId,
        month,
      ),
    );
  },
  /** Distinct categories the user has ever budgeted. */
  distinctCategoryCount(userId: string): number {
    const r = db.prepare("SELECT COUNT(DISTINCT categoryId) AS c FROM budgets WHERE userId = ?").get(userId);
    return Number((r as { c: number }).c);
  },
  upsert(userId: string, categoryId: string, month: string, limit: number): BudgetRow {
    const existing = db
      .prepare("SELECT id FROM budgets WHERE userId = ? AND categoryId = ? AND month = ?")
      .get(userId, categoryId, month) as { id: string } | undefined;
    if (existing) {
      db.prepare('UPDATE budgets SET "limit" = ? WHERE id = ?').run(limit, existing.id);
      return row<BudgetRow>(
        db.prepare('SELECT id,userId,categoryId,month,"limit",createdAt FROM budgets WHERE id = ?').get(existing.id),
      )!;
    }
    const r: BudgetRow = { id: newId(), userId, categoryId, month, limit, createdAt: nowIso() };
    db.prepare('INSERT INTO budgets (id,userId,categoryId,month,"limit",createdAt) VALUES (?,?,?,?,?,?)').run(
      r.id, r.userId, r.categoryId, r.month, r.limit, r.createdAt,
    );
    return r;
  },
  remove(userId: string, categoryId: string, month: string): void {
    db.prepare("DELETE FROM budgets WHERE userId = ? AND categoryId = ? AND month = ?").run(userId, categoryId, month);
  },
};

/* ------------------------------------------------------------------ *
 * Goals
 * ------------------------------------------------------------------ */
export const goals = {
  listByUser(userId: string): GoalRow[] {
    return rows<GoalRow>(
      db.prepare("SELECT * FROM goals WHERE userId = ? ORDER BY priority ASC, createdAt ASC").all(userId),
    );
  },
  findForUser(userId: string, id: string): GoalRow | undefined {
    return row<GoalRow>(db.prepare("SELECT * FROM goals WHERE id = ? AND userId = ?").get(id, userId));
  },
  create(input: {
    userId: string;
    name: string;
    type: string;
    icon: string;
    color: string;
    targetAmount: number;
    currentAmount: number;
    targetDate: string | null;
    monthlyContribution: number;
    note: string | null;
    priority: number;
  }): GoalRow {
    const r: GoalRow = { id: newId(), createdAt: nowIso(), ...input };
    db.prepare(
      `INSERT INTO goals
        (id,userId,name,type,icon,color,targetAmount,currentAmount,targetDate,monthlyContribution,note,priority,createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      r.id, r.userId, r.name, r.type, r.icon, r.color, r.targetAmount, r.currentAmount,
      r.targetDate, r.monthlyContribution, r.note, r.priority, r.createdAt,
    );
    return r;
  },
  update(
    id: string,
    patch: Partial<{
      name: string;
      type: string;
      icon: string;
      color: string;
      targetAmount: number;
      currentAmount: number;
      targetDate: string | null;
      monthlyContribution: number;
      note: string | null;
      priority: number;
    }>,
  ): GoalRow {
    applyUpdate("goals", id, patch);
    return row<GoalRow>(db.prepare("SELECT * FROM goals WHERE id = ?").get(id))!;
  },
  /** Add (or subtract) an amount from the saved total, clamped at zero. */
  contribute(id: string, deltaCents: number): GoalRow {
    db.prepare("UPDATE goals SET currentAmount = MAX(0, currentAmount + ?) WHERE id = ?").run(deltaCents, id);
    return row<GoalRow>(db.prepare("SELECT * FROM goals WHERE id = ?").get(id))!;
  },
  remove(id: string): void {
    db.prepare("DELETE FROM goals WHERE id = ?").run(id);
  },
};

/* ------------------------------------------------------------------ *
 * Debts
 * ------------------------------------------------------------------ */
export const debts = {
  listByUser(userId: string): DebtRow[] {
    return rows<DebtRow>(
      db.prepare("SELECT * FROM debts WHERE userId = ? ORDER BY createdAt ASC").all(userId),
    );
  },
  findForUser(userId: string, id: string): DebtRow | undefined {
    return row<DebtRow>(db.prepare("SELECT * FROM debts WHERE id = ? AND userId = ?").get(id, userId));
  },
  create(input: {
    userId: string;
    name: string;
    kind: string;
    icon: string;
    color: string;
    balance: number;
    aprBps: number;
    minimumPayment: number;
  }): DebtRow {
    const r: DebtRow = { id: newId(), createdAt: nowIso(), ...input };
    db.prepare(
      "INSERT INTO debts (id,userId,name,kind,icon,color,balance,aprBps,minimumPayment,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).run(r.id, r.userId, r.name, r.kind, r.icon, r.color, r.balance, r.aprBps, r.minimumPayment, r.createdAt);
    return r;
  },
  update(
    id: string,
    patch: Partial<{
      name: string;
      kind: string;
      icon: string;
      color: string;
      balance: number;
      aprBps: number;
      minimumPayment: number;
    }>,
  ): DebtRow {
    applyUpdate("debts", id, patch);
    return row<DebtRow>(db.prepare("SELECT * FROM debts WHERE id = ?").get(id))!;
  },
  remove(id: string): void {
    db.prepare("DELETE FROM debts WHERE id = ?").run(id);
  },
};

/* ------------------------------------------------------------------ *
 * Holdings (investments)
 * ------------------------------------------------------------------ */
export const holdings = {
  listByUser(userId: string): HoldingRow[] {
    return rows<HoldingRow>(
      db.prepare("SELECT * FROM holdings WHERE userId = ? ORDER BY createdAt ASC").all(userId),
    );
  },
  findForUser(userId: string, id: string): HoldingRow | undefined {
    return row<HoldingRow>(db.prepare("SELECT * FROM holdings WHERE id = ? AND userId = ?").get(id, userId));
  },
  create(input: {
    userId: string;
    name: string;
    symbol: string;
    assetClass: string;
    accountLabel: string;
    quantity: number;
    costBasis: number;
    currentPrice: number;
  }): HoldingRow {
    const r: HoldingRow = { id: newId(), createdAt: nowIso(), ...input };
    db.prepare(
      "INSERT INTO holdings (id,userId,name,symbol,assetClass,accountLabel,quantity,costBasis,currentPrice,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).run(r.id, r.userId, r.name, r.symbol, r.assetClass, r.accountLabel, r.quantity, r.costBasis, r.currentPrice, r.createdAt);
    return r;
  },
  update(
    id: string,
    patch: Partial<{
      name: string;
      symbol: string;
      assetClass: string;
      accountLabel: string;
      quantity: number;
      costBasis: number;
      currentPrice: number;
    }>,
  ): HoldingRow {
    applyUpdate("holdings", id, patch);
    return row<HoldingRow>(db.prepare("SELECT * FROM holdings WHERE id = ?").get(id))!;
  },
  remove(id: string): void {
    db.prepare("DELETE FROM holdings WHERE id = ?").run(id);
  },
};

/* ------------------------------------------------------------------ *
 * Family members + allowance ledger
 * ------------------------------------------------------------------ */
export const family = {
  listMembers(ownerId: string): FamilyMemberRow[] {
    return rows<FamilyMemberRow>(
      db.prepare("SELECT * FROM family_members WHERE ownerId = ? ORDER BY createdAt ASC").all(ownerId),
    );
  },
  memberCount(ownerId: string): number {
    const r = db.prepare("SELECT COUNT(*) AS c FROM family_members WHERE ownerId = ?").get(ownerId);
    return Number((r as { c: number }).c);
  },
  findMember(ownerId: string, id: string): FamilyMemberRow | undefined {
    return row<FamilyMemberRow>(db.prepare("SELECT * FROM family_members WHERE id = ? AND ownerId = ?").get(id, ownerId));
  },
  addMember(input: { ownerId: string; name: string; role: string; color: string }): FamilyMemberRow {
    const r: FamilyMemberRow = { id: newId(), createdAt: nowIso(), ...input };
    db.prepare("INSERT INTO family_members (id,ownerId,name,role,color,createdAt) VALUES (?,?,?,?,?,?)").run(
      r.id, r.ownerId, r.name, r.role, r.color, r.createdAt,
    );
    return r;
  },
  removeMember(id: string): void {
    db.prepare("DELETE FROM family_members WHERE id = ?").run(id);
  },
  /** Ledger entries for an owner's whole family (or one member). */
  ledger(ownerId: string, memberId?: string): FamilyLedgerRow[] {
    const sql = memberId
      ? "SELECT * FROM family_ledger WHERE ownerId = ? AND memberId = ? ORDER BY date DESC, createdAt DESC"
      : "SELECT * FROM family_ledger WHERE ownerId = ? ORDER BY date DESC, createdAt DESC";
    return rows<FamilyLedgerRow>(memberId ? db.prepare(sql).all(ownerId, memberId) : db.prepare(sql).all(ownerId));
  },
  addLedgerEntry(input: { ownerId: string; memberId: string; kind: string; amount: number; note: string | null; date: string }): FamilyLedgerRow {
    const r: FamilyLedgerRow = { id: newId(), createdAt: nowIso(), ...input };
    db.prepare(
      "INSERT INTO family_ledger (id,ownerId,memberId,kind,amount,note,date,createdAt) VALUES (?,?,?,?,?,?,?,?)",
    ).run(r.id, r.ownerId, r.memberId, r.kind, r.amount, r.note, r.date, r.createdAt);
    return r;
  },

  /* ---- chores ---- */
  listChores(ownerId: string): ChoreRow[] {
    return rows<ChoreRow>(db.prepare("SELECT * FROM family_chores WHERE ownerId = ? ORDER BY createdAt ASC").all(ownerId));
  },
  findChore(ownerId: string, id: string): ChoreRow | undefined {
    return row<ChoreRow>(db.prepare("SELECT * FROM family_chores WHERE id = ? AND ownerId = ?").get(id, ownerId));
  },
  addChore(input: { ownerId: string; memberId: string; name: string; reward: number; repeats: boolean }): ChoreRow {
    const r: ChoreRow = {
      id: newId(),
      ownerId: input.ownerId,
      memberId: input.memberId,
      name: input.name,
      reward: input.reward,
      repeats: boolToInt(input.repeats),
      timesDone: 0,
      lastDoneAt: null,
      createdAt: nowIso(),
    };
    db.prepare(
      "INSERT INTO family_chores (id,ownerId,memberId,name,reward,repeats,timesDone,lastDoneAt,createdAt) VALUES (?,?,?,?,?,?,?,?,?)",
    ).run(r.id, r.ownerId, r.memberId, r.name, r.reward, r.repeats, r.timesDone, r.lastDoneAt, r.createdAt);
    return r;
  },
  completeChore(id: string): void {
    db.prepare("UPDATE family_chores SET timesDone = timesDone + 1, lastDoneAt = ? WHERE id = ?").run(nowIso(), id);
  },
  removeChore(id: string): void {
    db.prepare("DELETE FROM family_chores WHERE id = ?").run(id);
  },

  /* ---- purchase requests ---- */
  listRequests(ownerId: string): FamilyRequestRow[] {
    return rows<FamilyRequestRow>(
      db.prepare(
        "SELECT * FROM family_requests WHERE ownerId = ? ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, createdAt DESC",
      ).all(ownerId),
    );
  },
  findRequest(ownerId: string, id: string): FamilyRequestRow | undefined {
    return row<FamilyRequestRow>(db.prepare("SELECT * FROM family_requests WHERE id = ? AND ownerId = ?").get(id, ownerId));
  },
  addRequest(input: { ownerId: string; memberId: string; title: string; amount: number; note: string | null }): FamilyRequestRow {
    const r: FamilyRequestRow = { id: newId(), status: "pending", createdAt: nowIso(), resolvedAt: null, ...input };
    db.prepare(
      "INSERT INTO family_requests (id,ownerId,memberId,title,amount,status,note,createdAt,resolvedAt) VALUES (?,?,?,?,?,?,?,?,?)",
    ).run(r.id, r.ownerId, r.memberId, r.title, r.amount, r.status, r.note, r.createdAt, r.resolvedAt);
    return r;
  },
  resolveRequest(id: string, status: "approved" | "declined"): void {
    db.prepare("UPDATE family_requests SET status = ?, resolvedAt = ? WHERE id = ? AND status = 'pending'").run(status, nowIso(), id);
  },
};

/* ------------------------------------------------------------------ *
 * Generic UPDATE builder (only sets provided keys)
 * ------------------------------------------------------------------ */
function applyUpdate(table: string, id: string, patch: Record<string, unknown>): void {
  const keys = Object.keys(patch).filter((k) => patch[k] !== undefined);
  if (keys.length === 0) return;
  const set = keys.map((k) => `"${k}" = ?`).join(", ");
  const params = keys.map((k) => p(patch[k]));
  db.prepare(`UPDATE ${table} SET ${set} WHERE id = ?`).run(...params, id);
}
