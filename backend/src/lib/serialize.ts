import type {
  Account,
  AccountType,
  Budget,
  Category,
  CategoryKind,
  AssetClass,
  Debt,
  DebtKind,
  Chore,
  FamilyLedgerEntry,
  FamilyLedgerKind,
  FamilyMember,
  FamilyRole,
  PurchaseRequest,
  PurchaseRequestStatus,
  Goal,
  GoalType,
  Holding,
  RolloverMode,
  Transaction,
  TransactionType,
  User,
} from "@budgetsmart/shared";
import { intToBool } from "../db/database.js";
import type {
  AccountRow,
  BudgetRow,
  CategoryRow,
  ChoreRow,
  DebtRow,
  FamilyLedgerRow,
  FamilyMemberRow,
  FamilyRequestRow,
  GoalRow,
  HoldingRow,
  TransactionRow,
  UserRow,
} from "../db/rows.js";

export function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

export const serializeUser = (u: UserRow): User & { tier: string } => ({
  id: u.id,
  email: u.email,
  name: u.name,
  currency: u.currency,
  tier: u.tier,
  createdAt: u.createdAt,
});

export const serializeFamilyLedgerEntry = (e: FamilyLedgerRow): FamilyLedgerEntry => ({
  id: e.id,
  memberId: e.memberId,
  kind: e.kind as FamilyLedgerKind,
  amount: e.amount,
  note: e.note,
  date: e.date,
  createdAt: e.createdAt,
});

/** Serialize a member, folding their ledger into a balance + totals. */
export const serializeFamilyMember = (m: FamilyMemberRow, entries: FamilyLedgerRow[]): FamilyMember => {
  const sum = (kind: string) => entries.filter((e) => e.kind === kind).reduce((s, e) => s + e.amount, 0);
  const allowanceTotal = sum("allowance");
  const spentTotal = sum("spend");
  const investedTotal = sum("invest");
  return {
    id: m.id,
    name: m.name,
    role: m.role as FamilyRole,
    color: m.color,
    balance: allowanceTotal - spentTotal - investedTotal,
    allowanceTotal,
    spentTotal,
    investedTotal,
    createdAt: m.createdAt,
  };
};

export const serializeChore = (c: ChoreRow): Chore => ({
  id: c.id,
  memberId: c.memberId,
  name: c.name,
  reward: c.reward,
  repeats: intToBool(c.repeats),
  timesDone: c.timesDone,
  lastDoneAt: c.lastDoneAt,
  createdAt: c.createdAt,
});

export const serializeFamilyRequest = (r: FamilyRequestRow): PurchaseRequest => ({
  id: r.id,
  memberId: r.memberId,
  title: r.title,
  amount: r.amount,
  status: r.status as PurchaseRequestStatus,
  note: r.note,
  createdAt: r.createdAt,
  resolvedAt: r.resolvedAt,
});

/** Account serializer needs the computed live balance passed in. */
export const serializeAccount = (a: AccountRow, balance: number): Account => ({
  id: a.id,
  name: a.name,
  type: a.type as AccountType,
  openingBalance: a.openingBalance,
  balance,
  currency: a.currency,
  archived: intToBool(a.archived),
  createdAt: a.createdAt,
});

export const serializeCategory = (c: CategoryRow): Category => ({
  id: c.id,
  name: c.name,
  parentId: c.parentId ?? null,
  kind: c.kind as CategoryKind,
  icon: c.icon,
  color: c.color,
  rollover: c.rollover as RolloverMode,
  hidden: intToBool(c.hidden),
  createdAt: c.createdAt,
});

export const serializeTransaction = (t: TransactionRow): Transaction => ({
  id: t.id,
  accountId: t.accountId,
  transferAccountId: t.transferAccountId,
  categoryId: t.categoryId,
  type: t.type as TransactionType,
  amount: t.amount,
  merchant: t.merchant,
  note: t.note,
  date: t.date,
  pending: intToBool(t.pending),
  excluded: intToBool(t.excluded),
  tags: parseTags(t.tags),
  createdAt: t.createdAt,
});

export const serializeBudget = (b: BudgetRow): Budget => ({
  id: b.id,
  categoryId: b.categoryId,
  month: b.month,
  limit: b.limit,
  createdAt: b.createdAt,
});

export const serializeGoal = (g: GoalRow): Goal => ({
  id: g.id,
  name: g.name,
  type: g.type as GoalType,
  icon: g.icon,
  color: g.color,
  targetAmount: g.targetAmount,
  currentAmount: g.currentAmount,
  targetDate: g.targetDate,
  monthlyContribution: g.monthlyContribution,
  note: g.note,
  priority: g.priority,
  createdAt: g.createdAt,
});

export const serializeDebt = (d: DebtRow): Debt => ({
  id: d.id,
  name: d.name,
  kind: d.kind as DebtKind,
  icon: d.icon,
  color: d.color,
  balance: d.balance,
  aprBps: d.aprBps,
  minimumPayment: d.minimumPayment,
  createdAt: d.createdAt,
});

export const serializeHolding = (h: HoldingRow): Holding => ({
  id: h.id,
  name: h.name,
  symbol: h.symbol,
  assetClass: h.assetClass as AssetClass,
  accountLabel: h.accountLabel,
  quantity: h.quantity,
  costBasis: h.costBasis,
  currentPrice: h.currentPrice,
  createdAt: h.createdAt,
});
