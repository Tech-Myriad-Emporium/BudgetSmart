/** Raw row shapes exactly as stored in SQLite (booleans are 0/1 integers). */

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  currency: string;
  tier: string;
  createdAt: string;
}

export interface CentralLinkRow {
  userId: string;
  email: string;
  token: string;
  tier: string;
  status: string | null;
  syncedAt: string;
  /** The central account's user id (binds the entitlement token). */
  centralUserId: string | null;
  /** Signed entitlement token — the source of truth for the tier. */
  entToken: string | null;
}

export interface FamilyMemberRow {
  id: string;
  ownerId: string;
  name: string;
  role: string;
  color: string;
  createdAt: string;
}

export interface FamilyLedgerRow {
  id: string;
  ownerId: string;
  memberId: string;
  kind: string;
  amount: number;
  note: string | null;
  date: string;
  createdAt: string;
}

export interface AccountRow {
  id: string;
  userId: string;
  name: string;
  type: string;
  openingBalance: number;
  currency: string;
  archived: number;
  createdAt: string;
}

export interface CategoryRow {
  id: string;
  userId: string;
  name: string;
  kind: string;
  icon: string;
  color: string;
  rollover: string;
  hidden: number;
  createdAt: string;
}

export interface TransactionRow {
  id: string;
  userId: string;
  accountId: string;
  transferAccountId: string | null;
  categoryId: string | null;
  type: string;
  amount: number;
  merchant: string;
  note: string | null;
  date: string;
  pending: number;
  excluded: number;
  tags: string;
  createdAt: string;
}

export interface BudgetRow {
  id: string;
  userId: string;
  categoryId: string;
  month: string;
  limit: number;
  createdAt: string;
}

export interface GoalRow {
  id: string;
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
  createdAt: string;
}

export interface DebtRow {
  id: string;
  userId: string;
  name: string;
  kind: string;
  icon: string;
  color: string;
  balance: number;
  aprBps: number;
  minimumPayment: number;
  createdAt: string;
}

export interface HoldingRow {
  id: string;
  userId: string;
  name: string;
  symbol: string;
  assetClass: string;
  accountLabel: string;
  quantity: number;
  costBasis: number;
  currentPrice: number;
  createdAt: string;
}
