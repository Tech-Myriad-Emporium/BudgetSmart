import type {
  Account,
  Budget,
  BudgetSummary,
  Category,
  CategorySpend,
  Debt,
  DebtsOverview,
  DebtStrategy,
  Entitlements,
  FamilyOverview,
  Feature,
  Chore,
  CsvMapping,
  ForecastSummary,
  GamificationState,
  ImportAnalysis,
  Goal,
  GoalsSummary,
  GrowthProjection,
  Holding,
  InsightsSummary,
  IntelligenceSummary,
  NetWorthDetail,
  PayoffPlan,
  Portfolio,
  PurchaseRequest,
  RecurringSummary,
  ReportData,
  SafeToSpend,
  Tier,
  Transaction,
  TransactionType,
} from "@budgetsmart/shared";

const TOKEN_KEY = "budgetsmart.token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) tokenStore.clear();
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body.details);
  }
  return body as T;
}

const qs = (params: Record<string, unknown>): string => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
};

/* ------------------------------------------------------------------ *
 * Response payload types
 * ------------------------------------------------------------------ */

export interface AuthPayload {
  token: string;
  user: { id: string; email: string; name: string; currency: string; tier?: string; createdAt: string };
}

export interface DashboardData {
  month: string;
  accounts: Account[];
  netWorth: { assets: number; liabilities: number; total: number };
  safeToSpend: SafeToSpend;
  cashflow: { income: number; expenses: number; net: number };
  budgetSummary: BudgetSummary;
  spendBreakdown: CategorySpend[];
  recentTransactions: Transaction[];
}

export interface TransactionFilters {
  accountId?: string;
  categoryId?: string;
  type?: TransactionType;
  from?: string;
  to?: string;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

export interface TransactionInput {
  accountId: string;
  transferAccountId?: string | null;
  categoryId?: string | null;
  type: TransactionType;
  amount: number;
  merchant: string;
  note?: string | null;
  date: string;
  pending?: boolean;
  excluded?: boolean;
  tags?: string[];
}

/* ------------------------------------------------------------------ *
 * Endpoints
 * ------------------------------------------------------------------ */

export const api = {
  // auth
  login: (email: string, password: string) =>
    request<AuthPayload>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (input: { email: string; password: string; name: string }) =>
    request<AuthPayload>("/auth/register", { method: "POST", body: JSON.stringify(input) }),
  me: () => request<{ user: AuthPayload["user"] }>("/auth/me"),

  // dashboard
  dashboard: (month?: string) => request<DashboardData>(`/dashboard${qs({ month })}`),

  // accounts
  listAccounts: () => request<{ accounts: Account[] }>("/accounts"),
  createAccount: (input: { name: string; type: string; openingBalance: number }) =>
    request<{ account: Account }>("/accounts", { method: "POST", body: JSON.stringify(input) }),
  updateAccount: (id: string, input: Record<string, unknown>) =>
    request<{ account: Account }>(`/accounts/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteAccount: (id: string) => request<void>(`/accounts/${id}`, { method: "DELETE" }),

  // categories
  listCategories: () => request<{ categories: Category[] }>("/categories"),
  createCategory: (input: Record<string, unknown>) =>
    request<{ category: Category }>("/categories", { method: "POST", body: JSON.stringify(input) }),
  updateCategory: (id: string, input: Record<string, unknown>) =>
    request<{ category: Category }>(`/categories/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteCategory: (id: string) => request<void>(`/categories/${id}`, { method: "DELETE" }),

  // transactions
  listTransactions: (filters: TransactionFilters = {}) =>
    request<{ transactions: Transaction[]; total: number; limit: number; offset: number }>(
      `/transactions${qs(filters as Record<string, unknown>)}`,
    ),
  createTransaction: (input: TransactionInput) =>
    request<{ transaction: Transaction }>("/transactions", { method: "POST", body: JSON.stringify(input) }),
  updateTransaction: (id: string, input: Partial<TransactionInput>) =>
    request<{ transaction: Transaction }>(`/transactions/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteTransaction: (id: string) => request<void>(`/transactions/${id}`, { method: "DELETE" }),

  // budgets
  budgets: (month?: string) =>
    request<{ summary: BudgetSummary; budgets: Budget[] }>(`/budgets${qs({ month })}`),
  setBudget: (input: { categoryId: string; month: string; limit: number }) =>
    request<{ budget: Budget | null }>("/budgets", { method: "PUT", body: JSON.stringify(input) }),

  // goals
  goals: () => request<{ summary: GoalsSummary }>("/goals"),
  createGoal: (input: GoalInput) =>
    request<{ goal: Goal }>("/goals", { method: "POST", body: JSON.stringify(input) }),
  updateGoal: (id: string, input: Partial<GoalInput>) =>
    request<{ goal: Goal }>(`/goals/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  contributeGoal: (id: string, amount: number) =>
    request<{ goal: Goal }>(`/goals/${id}/contribute`, { method: "POST", body: JSON.stringify({ amount }) }),
  deleteGoal: (id: string) => request<void>(`/goals/${id}`, { method: "DELETE" }),

  // debts
  debts: () => request<{ overview: DebtsOverview }>("/debts"),
  debtPlan: (strategy: DebtStrategy, extra: number) =>
    request<{ plan: PayoffPlan }>(`/debts/plan${qs({ strategy, extra })}`),
  createDebt: (input: DebtInput) =>
    request<{ debt: Debt }>("/debts", { method: "POST", body: JSON.stringify(input) }),
  updateDebt: (id: string, input: Partial<DebtInput>) =>
    request<{ debt: Debt }>(`/debts/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteDebt: (id: string) => request<void>(`/debts/${id}`, { method: "DELETE" }),

  // investments
  investments: () => request<{ portfolio: Portfolio }>("/investments"),
  investmentProjection: (monthly: number, returnPct: number, years: number) =>
    request<{ projection: GrowthProjection }>(`/investments/projection${qs({ monthly, returnPct, years })}`),
  createHolding: (input: HoldingInput) =>
    request<{ holding: Holding }>("/investments", { method: "POST", body: JSON.stringify(input) }),
  updateHolding: (id: string, input: Partial<HoldingInput>) =>
    request<{ holding: Holding }>(`/investments/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteHolding: (id: string) => request<void>(`/investments/${id}`, { method: "DELETE" }),

  // subscription / entitlements
  plans: () => request<{ tiers: Tier[]; features: Feature[] }>("/subscription/plans"),
  subscription: () => request<{ tierId: string; entitlements: Entitlements }>("/subscription"),
  changeTier: (tierId: string) =>
    request<{ tierId: string; entitlements: Entitlements; user: AuthPayload["user"] }>("/subscription", {
      method: "PUT",
      body: JSON.stringify({ tierId }),
    }),

  // central account link (subscription bought on the web syncs here)
  account: () => request<AccountLink>("/account"),
  linkAccount: (email: string, password: string) =>
    request<AccountLink>("/account/link", { method: "POST", body: JSON.stringify({ email, password }) }),
  syncAccount: () => request<AccountLink & { reauth?: boolean; stale?: boolean }>("/account/sync", { method: "POST" }),
  unlinkAccount: () => request<AccountLink>("/account/unlink", { method: "POST" }),

  // family
  family: () => request<{ overview: FamilyOverview }>("/family"),
  addFamilyMember: (input: { name: string; role: string; color: string }) =>
    request<{ overview: FamilyOverview }>("/family/members", { method: "POST", body: JSON.stringify(input) }),
  removeFamilyMember: (id: string) =>
    request<{ overview: FamilyOverview }>(`/family/members/${id}`, { method: "DELETE" }),
  addAllowance: (id: string, amount: number, note?: string | null) =>
    request<{ overview: FamilyOverview }>(`/family/members/${id}/allowance`, {
      method: "POST",
      body: JSON.stringify({ amount, note: note ?? null }),
    }),
  recordFamily: (id: string, kind: "spend" | "invest", amount: number, note?: string | null) =>
    request<{ overview: FamilyOverview }>(`/family/members/${id}/record`, {
      method: "POST",
      body: JSON.stringify({ kind, amount, note: note ?? null }),
    }),
  familyChores: () => request<{ chores: Chore[] }>("/family/chores"),
  addChore: (input: { memberId: string; name: string; reward: number; repeats: boolean }) =>
    request<{ chores: Chore[] }>("/family/chores", { method: "POST", body: JSON.stringify(input) }),
  completeChore: (id: string) =>
    request<{ chores: Chore[]; overview: FamilyOverview }>(`/family/chores/${id}/complete`, { method: "POST" }),
  removeChore: (id: string) => request<{ chores: Chore[] }>(`/family/chores/${id}`, { method: "DELETE" }),
  familyRequests: () => request<{ requests: PurchaseRequest[] }>("/family/requests"),
  addFamilyRequest: (input: { memberId: string; title: string; amount: number; note?: string | null }) =>
    request<{ requests: PurchaseRequest[] }>("/family/requests", {
      method: "POST",
      body: JSON.stringify({ ...input, note: input.note ?? null }),
    }),
  resolveFamilyRequest: (id: string, approve: boolean) =>
    request<{ requests: PurchaseRequest[]; overview: FamilyOverview }>(`/family/requests/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ approve }),
    }),

  // gamification
  gamification: () => request<{ state: GamificationState }>("/gamification"),

  // net worth
  netWorth: () => request<{ detail: NetWorthDetail }>("/networth"),

  // recurring
  recurring: () => request<{ summary: RecurringSummary }>("/recurring"),

  // monthly email digest
  summaryPrefs: () => request<{ enabled: boolean; lastSentMonth: string | null }>("/summary/prefs"),
  setSummaryPrefs: (enabled: boolean) =>
    request<{ enabled: boolean; lastSentMonth: string | null }>("/summary/prefs", {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }),
  sendSummaryNow: () => request<{ ok: boolean; month: string; sentTo?: string }>("/summary/send-now", { method: "POST" }),

  // statement import
  importPreview: (content: string, mapping?: CsvMapping) =>
    request<{ analysis: ImportAnalysis }>("/import/preview", { method: "POST", body: JSON.stringify({ content, mapping }) }),
  importCommit: (accountId: string, rows: Array<{ date: string; amount: number; type: TransactionType; merchant: string; note: string | null; categoryId: string | null }>) =>
    request<{ created: number }>("/import/commit", { method: "POST", body: JSON.stringify({ accountId, rows }) }),

  // tier intelligence
  insights: () => request<{ summary: InsightsSummary }>("/insights"),
  forecast: () => request<{ summary: ForecastSummary }>("/forecast"),
  intelligence: (match?: { salary: number; contribPct: number; matchPct: number; matchCapPct: number }) =>
    request<{ summary: IntelligenceSummary }>(`/intelligence${match ? qs(match) : ""}`),

  // reports
  report: (months: number) => request<{ report: ReportData }>(`/reports${qs({ months })}`),
  exportCsv: async (): Promise<Blob> => {
    const token = tokenStore.get();
    const res = await fetch("/api/reports/export.csv", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new ApiError(res.status, "Export failed");
    return res.blob();
  },
};

export interface AccountLink {
  linked: boolean;
  email?: string;
  tier?: string;
  status?: string | null;
  syncedAt?: string;
  entitlements?: Entitlements;
}

export interface DebtInput {
  name: string;
  kind: string;
  icon: string;
  color: string;
  balance: number;
  aprBps: number;
  minimumPayment: number;
}

export interface HoldingInput {
  name: string;
  symbol: string;
  assetClass: string;
  accountLabel: string;
  quantity: number;
  costBasis: number;
  currentPrice: number;
}

export interface GoalInput {
  name: string;
  type: string;
  icon: string;
  color: string;
  targetAmount: number;
  currentAmount?: number;
  targetDate?: string | null;
  monthlyContribution?: number;
  note?: string | null;
  priority?: number;
}
