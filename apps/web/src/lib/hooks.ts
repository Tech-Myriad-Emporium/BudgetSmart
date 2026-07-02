import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DebtStrategy } from "@budgetsmart/shared";
import {
  api,
  type DebtInput,
  type GoalInput,
  type HoldingInput,
  type TransactionFilters,
  type TransactionInput,
} from "./api";

/** Invalidate everything that depends on financial data after a write. */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["dashboard"] }),
      qc.invalidateQueries({ queryKey: ["transactions"] }),
      qc.invalidateQueries({ queryKey: ["accounts"] }),
      qc.invalidateQueries({ queryKey: ["budgets"] }),
    ]);
}

export const useDashboard = (month?: string) =>
  useQuery({ queryKey: ["dashboard", month ?? "current"], queryFn: () => api.dashboard(month) });

export const useAccounts = () =>
  useQuery({ queryKey: ["accounts"], queryFn: () => api.listAccounts().then((r) => r.accounts) });

export const useCategories = () =>
  useQuery({ queryKey: ["categories"], queryFn: () => api.listCategories().then((r) => r.categories) });

export const useTransactions = (filters: TransactionFilters) =>
  useQuery({
    queryKey: ["transactions", filters],
    queryFn: () => api.listTransactions(filters),
    placeholderData: (prev) => prev,
  });

export const useBudgets = (month?: string) =>
  useQuery({ queryKey: ["budgets", month ?? "current"], queryFn: () => api.budgets(month) });

export function useTransactionMutations() {
  const invalidate = useInvalidateAll();
  const create = useMutation({
    mutationFn: (input: TransactionInput) => api.createTransaction(input),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<TransactionInput> }) =>
      api.updateTransaction(id, input),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteTransaction(id),
    onSuccess: invalidate,
  });
  return { create, update, remove };
}

export function useAccountMutations() {
  const invalidate = useInvalidateAll();
  const create = useMutation({
    mutationFn: (input: { name: string; type: string; openingBalance: number }) =>
      api.createAccount(input),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteAccount(id),
    onSuccess: invalidate,
  });
  return { create, remove };
}

export function useBudgetMutation() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { categoryId: string; month: string; limit: number }) => api.setBudget(input),
    onSuccess: invalidate,
  });
}

export const useGoals = () =>
  useQuery({ queryKey: ["goals"], queryFn: () => api.goals().then((r) => r.summary) });

export function useGoalMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["goals"] });
  const create = useMutation({ mutationFn: (input: GoalInput) => api.createGoal(input), onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<GoalInput> }) => api.updateGoal(id, input),
    onSuccess: invalidate,
  });
  const contribute = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) => api.contributeGoal(id, amount),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteGoal(id), onSuccess: invalidate });
  return { create, update, contribute, remove };
}

export const useReport = (months: number) =>
  useQuery({
    queryKey: ["report", months],
    queryFn: () => api.report(months).then((r) => r.report),
    placeholderData: (prev) => prev,
  });

export const useRecurring = () =>
  useQuery({ queryKey: ["recurring"], queryFn: () => api.recurring() });

export function useRecurringOverrides() {
  const qc = useQueryClient();
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["recurring"] }),
      qc.invalidateQueries({ queryKey: ["forecast"] }),
    ]);
  const set = useMutation({
    mutationFn: (input: { merchant: string; mode: "always" | "never"; cadence?: string; amount?: number }) =>
      api.setRecurringOverride(input),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (key: string) => api.removeRecurringOverride(key), onSuccess: invalidate });
  return { set, remove };
}

export const usePulse = (enabled: boolean) =>
  useQuery({ queryKey: ["pulse"], queryFn: () => api.pulse().then((r) => r.summary), enabled });

export const useInsights = () =>
  useQuery({ queryKey: ["insights"], queryFn: () => api.insights().then((r) => r.summary) });

export const useSummaryPrefs = (enabled: boolean) =>
  useQuery({ queryKey: ["summary-prefs"], queryFn: () => api.summaryPrefs(), enabled });

export function useSummaryMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["summary-prefs"] });
  const setPrefs = useMutation({
    mutationFn: (prefs: { enabled?: boolean; weeklyEnabled?: boolean }) => api.setSummaryPrefs(prefs),
    onSuccess: invalidate,
  });
  const sendNow = useMutation({ mutationFn: () => api.sendSummaryNow(), onSuccess: invalidate });
  const sendWeeklyNow = useMutation({ mutationFn: () => api.sendWeeklyNow(), onSuccess: invalidate });
  return { setPrefs, sendNow, sendWeeklyNow };
}

export const useWeeklyReport = () =>
  useQuery({ queryKey: ["weekly-report"], queryFn: () => api.weeklyReport().then((r) => r.report) });

export const useForecast = () =>
  useQuery({ queryKey: ["forecast"], queryFn: () => api.forecast().then((r) => r.summary) });

export const useIntelligence = (match?: { salary: number; contribPct: number; matchPct: number; matchCapPct: number }) =>
  useQuery({
    queryKey: ["intelligence", match ?? null],
    queryFn: () => api.intelligence(match).then((r) => r.summary),
    placeholderData: (prev) => prev,
  });

export const useNetWorth = () =>
  useQuery({ queryKey: ["networth"], queryFn: () => api.netWorth().then((r) => r.detail) });

export const useGamification = () =>
  useQuery({ queryKey: ["gamification"], queryFn: () => api.gamification().then((r) => r.state) });

export const usePlans = () => useQuery({ queryKey: ["plans"], queryFn: () => api.plans() });

export const useSubscription = () =>
  useQuery({ queryKey: ["subscription"], queryFn: () => api.subscription() });

/* ------------------------------------------------------------------ *
 * Central account link (web subscription ↔ this device)
 * ------------------------------------------------------------------ */
export const useAccountLink = () => useQuery({ queryKey: ["account"], queryFn: () => api.account() });

function useAfterEntitlementChange() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["account"] }),
      qc.invalidateQueries({ queryKey: ["subscription"] }),
    ]);
}

export function useLinkAccount() {
  const after = useAfterEntitlementChange();
  return useMutation({ mutationFn: ({ email, password }: { email: string; password: string }) => api.linkAccount(email, password), onSuccess: after });
}

export function useSyncAccount() {
  const after = useAfterEntitlementChange();
  return useMutation({ mutationFn: () => api.syncAccount(), onSuccess: after });
}

export function useUnlinkAccount() {
  const after = useAfterEntitlementChange();
  return useMutation({ mutationFn: () => api.unlinkAccount(), onSuccess: after });
}

/** Resolved feature access for the current user's plan. */
export function useEntitlements() {
  const q = useSubscription();
  const features = q.data?.entitlements.features ?? [];
  const set = new Set(features);
  return {
    loading: q.isLoading,
    ready: q.isSuccess,
    tier: q.data?.entitlements.tier ?? null,
    features: set,
    /** True while loading (optimistic) or once the feature is actually granted. */
    has: (key: string) => !q.isSuccess || set.has(key),
  };
}

export function useChangeTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tierId: string) => api.changeTier(tierId),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["subscription"] }),
        qc.invalidateQueries({ queryKey: ["family"] }),
        qc.invalidateQueries({ queryKey: ["me"] }),
      ]),
  });
}

export const useFamily = (enabled: boolean) =>
  useQuery({ queryKey: ["family"], queryFn: () => api.family().then((r) => r.overview), enabled });

export function useFamilyMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["family"] });
  const addMember = useMutation({
    mutationFn: (input: { name: string; role: string; color: string }) => api.addFamilyMember(input),
    onSuccess: invalidate,
  });
  const removeMember = useMutation({ mutationFn: (id: string) => api.removeFamilyMember(id), onSuccess: invalidate });
  const addAllowance = useMutation({
    mutationFn: ({ id, amount, note }: { id: string; amount: number; note?: string }) => api.addAllowance(id, amount, note),
    onSuccess: invalidate,
  });
  const record = useMutation({
    mutationFn: ({ id, kind, amount, note }: { id: string; kind: "spend" | "invest"; amount: number; note?: string }) =>
      api.recordFamily(id, kind, amount, note),
    onSuccess: invalidate,
  });
  return { addMember, removeMember, addAllowance, record };
}

export const useFamilyChores = (enabled: boolean) =>
  useQuery({ queryKey: ["family-chores"], queryFn: () => api.familyChores().then((r) => r.chores), enabled });

export const useFamilyRequests = (enabled: boolean) =>
  useQuery({ queryKey: ["family-requests"], queryFn: () => api.familyRequests().then((r) => r.requests), enabled });

export function useChoreMutations() {
  const qc = useQueryClient();
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["family-chores"] }),
      qc.invalidateQueries({ queryKey: ["family"] }),
    ]);
  const add = useMutation({
    mutationFn: (input: { memberId: string; name: string; reward: number; repeats: boolean }) => api.addChore(input),
    onSuccess: invalidate,
  });
  const complete = useMutation({ mutationFn: (id: string) => api.completeChore(id), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => api.removeChore(id), onSuccess: invalidate });
  return { add, complete, remove };
}

export function useRequestMutations() {
  const qc = useQueryClient();
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["family-requests"] }),
      qc.invalidateQueries({ queryKey: ["family"] }),
    ]);
  const add = useMutation({
    mutationFn: (input: { memberId: string; title: string; amount: number; note?: string | null }) =>
      api.addFamilyRequest(input),
    onSuccess: invalidate,
  });
  const resolve = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => api.resolveFamilyRequest(id, approve),
    onSuccess: invalidate,
  });
  return { add, resolve };
}

export const usePortfolio = () =>
  useQuery({ queryKey: ["portfolio"], queryFn: () => api.investments().then((r) => r.portfolio) });

export const useProjection = (monthly: number, returnPct: number, years: number) =>
  useQuery({
    queryKey: ["projection", monthly, returnPct, years],
    queryFn: () => api.investmentProjection(monthly, returnPct, years).then((r) => r.projection),
    placeholderData: (prev) => prev,
  });

export function useHoldingMutations() {
  const qc = useQueryClient();
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["portfolio"] }),
      qc.invalidateQueries({ queryKey: ["projection"] }),
    ]);
  const create = useMutation({ mutationFn: (input: HoldingInput) => api.createHolding(input), onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<HoldingInput> }) => api.updateHolding(id, input),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteHolding(id), onSuccess: invalidate });
  return { create, update, remove };
}

export const useDebts = () =>
  useQuery({ queryKey: ["debts"], queryFn: () => api.debts().then((r) => r.overview) });

export const useDebtPlan = (strategy: DebtStrategy, extra: number) =>
  useQuery({
    queryKey: ["debt-plan", strategy, extra],
    queryFn: () => api.debtPlan(strategy, extra).then((r) => r.plan),
    placeholderData: (prev) => prev,
  });

export function useDebtMutations() {
  const qc = useQueryClient();
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["debts"] }),
      qc.invalidateQueries({ queryKey: ["debt-plan"] }),
    ]);
  const create = useMutation({ mutationFn: (input: DebtInput) => api.createDebt(input), onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<DebtInput> }) => api.updateDebt(id, input),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteDebt(id), onSuccess: invalidate });
  return { create, update, remove };
}
