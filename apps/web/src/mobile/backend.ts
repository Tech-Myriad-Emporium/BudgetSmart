// In-WebView API — dispatches the app's /api/* calls to on-device handlers,
// reusing the same repo + serializers + shared engines as the server. Covers
// the base-tier feature set (offline). Premium features unlock online.
import {
  FEATURES, LIABILITY_ACCOUNT_TYPES, TIERS, buildBudgetSummary, buildDebtsOverview, buildGoalsSummary,
  categorySpendBreakdown, computeAccountBalance, computePayoffPlan, computeSafeToSpend, currentMonth,
  isMonth, previousMonth, resolveEntitlements, sumCents, type AccountType, type DebtStrategy,
} from "@budgetsmart/shared";
import { accounts, budgets, categories, debts, goals, transactions, users } from "./repo";
import {
  computeBalancesForUser, serializeAccount, serializeBudget, serializeCategory, serializeDebt,
  serializeGoal, serializeTransaction, serializeUser,
} from "./serialize";

const DEFAULT_CATEGORIES = [
  { name: "Salary", kind: "income", icon: "💼", color: "#00FF41", rollover: "none" },
  { name: "Side Income", kind: "income", icon: "🪙", color: "#00FFB2", rollover: "none" },
  { name: "Groceries", kind: "expense", icon: "🛒", color: "#00FF41", rollover: "positive" },
  { name: "Rent", kind: "expense", icon: "🏠", color: "#00E0FF", rollover: "none" },
  { name: "Utilities", kind: "expense", icon: "💡", color: "#FFD600", rollover: "none" },
  { name: "Dining Out", kind: "expense", icon: "🍔", color: "#FF7A00", rollover: "positive" },
  { name: "Transport", kind: "expense", icon: "🚗", color: "#B388FF", rollover: "positive" },
  { name: "Subscriptions", kind: "expense", icon: "📺", color: "#FF00AA", rollover: "none" },
  { name: "Shopping", kind: "expense", icon: "🛍️", color: "#FF0033", rollover: "positive" },
  { name: "Health", kind: "expense", icon: "🩺", color: "#00FFB2", rollover: "full" },
  { name: "Entertainment", kind: "expense", icon: "🎮", color: "#B388FF", rollover: "positive" },
  { name: "Savings", kind: "expense", icon: "🐷", color: "#00FF41", rollover: "full" },
];

/* ---------- password hashing (PBKDF2 via Web Crypto) ---------- */
const enc = new TextEncoder();
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function pbkdf2(pw: string, salt: Uint8Array, iters: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pw) as BufferSource, "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt as BufferSource, iterations: iters, hash: "SHA-256" }, key, 256));
}
async function hashPassword(pw: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$100000$${b64(salt)}$${b64(await pbkdf2(pw, salt, 100000))}`;
}
async function verifyPassword(pw: string, stored: string) {
  const [scheme, it, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2") return false;
  const actual = await pbkdf2(pw, unb64(salt!), Number(it));
  return b64(actual) === hash;
}

export interface ApiResult {
  status: number;
  body: unknown;
}
const ok = (body: unknown, status = 200): ApiResult => ({ status, body });
const err = (status: number, error: string): ApiResult => ({ status, body: { error } });

const balances = (userId: string) =>
  computeBalancesForUser(userId, accounts, transactions, computeAccountBalance);

/**
 * Handle one API call. `auth` is the userId resolved from the Bearer token
 * (the local token IS the userId — there's no trust boundary on-device).
 */
export async function handleApi(method: string, path: string, query: URLSearchParams, body: any, auth: string | null): Promise<ApiResult> {
  const seg = path.replace(/^\/+|\/+$/g, "").split("/"); // e.g. ["transactions","<id>"]
  const [root, id, sub] = seg;

  /* ---------- auth (public) ---------- */
  if (root === "auth") {
    if (sub === undefined && id === "register" && method === "POST") {
      const email = String(body.email ?? "").toLowerCase().trim();
      const password = String(body.password ?? "");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err(400, "Enter a valid email");
      if (password.length < 8) return err(400, "Password must be at least 8 characters");
      if (users.findByEmail(email)) return err(409, "An account with that email already exists");
      const user = users.create({ email, passwordHash: await hashPassword(password), name: String(body.name ?? "There"), currency: String(body.currency ?? "USD") });
      if (categories.countByUser(user.id) === 0) categories.createMany(DEFAULT_CATEGORIES.map((c) => ({ ...c, userId: user.id })));
      return ok({ token: user.id, user: serializeUser(user) }, 201);
    }
    if (id === "login" && method === "POST") {
      const email = String(body.email ?? "").toLowerCase().trim();
      const user = users.findByEmail(email);
      if (!user || !(await verifyPassword(String(body.password ?? ""), user.passwordHash))) return err(401, "Invalid email or password");
      return ok({ token: user.id, user: serializeUser(user) });
    }
    if (id === "me" && method === "GET") {
      const u = auth ? users.findById(auth) : undefined;
      return u ? ok({ user: serializeUser(u) }) : err(401, "Not authenticated");
    }
  }

  // Everything below needs auth.
  const userId = auth && users.findById(auth) ? auth : null;
  if (!userId) return err(401, "Not authenticated");

  /* ---------- accounts ---------- */
  if (root === "accounts") {
    if (!id && method === "GET") { const b = balances(userId); return ok({ accounts: accounts.listByUser(userId).map((a) => serializeAccount(a, b.get(a.id) ?? a.openingBalance)) }); }
    if (!id && method === "POST") { const a = accounts.create({ userId, name: body.name, type: body.type, openingBalance: body.openingBalance ?? 0, currency: body.currency ?? "USD" }); return ok({ account: serializeAccount(a, a.openingBalance) }, 201); }
    if (id && method === "PATCH") { const e = accounts.findForUser(userId, id); if (!e) return err(404, "Account not found"); const u = accounts.update(e.id, body); const b = balances(userId); return ok({ account: serializeAccount(u, b.get(u.id) ?? u.openingBalance) }); }
    if (id && method === "DELETE") { const e = accounts.findForUser(userId, id); if (!e) return err(404, "Account not found"); accounts.remove(e.id); return ok(undefined, 204); }
  }

  /* ---------- categories ---------- */
  if (root === "categories") {
    if (!id && method === "GET") return ok({ categories: categories.listByUser(userId).map(serializeCategory) });
    if (!id && method === "POST") { if (categories.findByName(userId, body.name)) return err(409, "A category with that name already exists"); const c = categories.create({ userId, name: body.name, kind: body.kind, icon: body.icon ?? "💸", color: body.color ?? "#00FF41", rollover: body.rollover ?? "none", hidden: body.hidden ?? false }); return ok({ category: serializeCategory(c) }, 201); }
    if (id && method === "PATCH") { const e = categories.findForUser(userId, id); if (!e) return err(404, "Category not found"); return ok({ category: serializeCategory(categories.update(e.id, body)) }); }
    if (id && method === "DELETE") { const e = categories.findForUser(userId, id); if (!e) return err(404, "Category not found"); categories.remove(e.id); return ok(undefined, 204); }
  }

  /* ---------- transactions ---------- */
  if (root === "transactions") {
    if (!id && method === "GET") {
      const num = (k: string) => (query.get(k) != null ? Number(query.get(k)) : undefined);
      const f = { accountId: query.get("accountId") || undefined, categoryId: query.get("categoryId") || undefined, type: query.get("type") || undefined, from: query.get("from") || undefined, to: query.get("to") || undefined, minAmount: num("minAmount"), maxAmount: num("maxAmount"), search: query.get("search")?.trim() || undefined, tag: query.get("tag") || undefined };
      const limit = num("limit") ?? 200, offset = num("offset") ?? 0;
      return ok({ transactions: transactions.list(userId, f, limit, offset).map(serializeTransaction), total: transactions.count(userId, f), limit, offset });
    }
    if (!id && method === "POST") {
      const ownIds = [body.accountId, body.transferAccountId].filter(Boolean);
      if (ownIds.length && accounts.countOwned(userId, [...new Set(ownIds)] as string[]) !== new Set(ownIds).size) return err(400, "Unknown account");
      if (body.type !== "transfer" && body.categoryId && !categories.findForUser(userId, body.categoryId)) return err(400, "Unknown category");
      const tx = transactions.create({ userId, accountId: body.accountId, transferAccountId: body.type === "transfer" ? body.transferAccountId ?? null : null, categoryId: body.type === "transfer" ? null : body.categoryId ?? null, type: body.type, amount: body.amount, merchant: body.merchant ?? "", note: body.note ?? null, date: body.date, pending: body.pending ?? false, excluded: body.excluded ?? false, tags: JSON.stringify(body.tags ?? []) });
      return ok({ transaction: serializeTransaction(tx) }, 201);
    }
    if (id && method === "PATCH") {
      const e = transactions.findForUser(userId, id); if (!e) return err(404, "Transaction not found");
      const patch: any = { ...body };
      if (body.tags !== undefined) patch.tags = JSON.stringify(body.tags);
      return ok({ transaction: serializeTransaction(transactions.update(e.id, patch)) });
    }
    if (id && method === "DELETE") { const e = transactions.findForUser(userId, id); if (!e) return err(404, "Transaction not found"); transactions.remove(e.id); return ok(undefined, 204); }
  }

  /* ---------- budgets ---------- */
  if (root === "budgets") {
    const month = query.get("month") && isMonth(query.get("month")!) ? query.get("month")! : currentMonth();
    if (method === "GET") {
      const summary = buildBudgetSummary({ month, categories: categories.listByUser(userId).map(serializeCategory), budgets: budgets.listByUserMonth(userId, month).map(serializeBudget), priorBudgets: budgets.listByUserMonth(userId, previousMonth(month)).map(serializeBudget), transactions: transactions.allByUser(userId).map(serializeTransaction) });
      return ok({ summary, budgets: budgets.listByUserMonth(userId, month).map(serializeBudget) });
    }
    if (method === "PUT") {
      const cat = categories.findForUser(userId, body.categoryId); if (!cat) return err(400, "Unknown category");
      if (cat.kind !== "expense") return err(400, "Only expense categories can be budgeted");
      if (body.limit === 0) { budgets.remove(userId, body.categoryId, body.month); return ok({ budget: null }); }
      return ok({ budget: serializeBudget(budgets.upsert(userId, body.categoryId, body.month, body.limit)) });
    }
  }

  /* ---------- goals ---------- */
  if (root === "goals") {
    if (!id && method === "GET") return ok({ summary: buildGoalsSummary(goals.listByUser(userId).map(serializeGoal)) });
    if (!id && method === "POST") { const g = goals.create({ userId, name: body.name, type: body.type ?? "savings", icon: body.icon ?? "🎯", color: body.color ?? "#00FF41", targetAmount: body.targetAmount, currentAmount: body.currentAmount ?? 0, targetDate: body.targetDate ?? null, monthlyContribution: body.monthlyContribution ?? 0, note: body.note ?? null, priority: body.priority ?? 0 }); return ok({ goal: serializeGoal(g) }, 201); }
    if (id && sub === "contribute" && method === "POST") { const e = goals.findForUser(userId, id); if (!e) return err(404, "Goal not found"); return ok({ goal: serializeGoal(goals.contribute(e.id, body.amount)) }); }
    if (id && method === "PATCH") { const e = goals.findForUser(userId, id); if (!e) return err(404, "Goal not found"); return ok({ goal: serializeGoal(goals.update(e.id, body)) }); }
    if (id && method === "DELETE") { const e = goals.findForUser(userId, id); if (!e) return err(404, "Goal not found"); goals.remove(e.id); return ok(undefined, 204); }
  }

  /* ---------- debts ---------- */
  if (root === "debts") {
    if (!id && method === "GET") return ok({ overview: buildDebtsOverview(debts.listByUser(userId).map(serializeDebt)) });
    if (id === "plan" && method === "GET") { const strategy = (query.get("strategy") as DebtStrategy) || "avalanche"; const extra = Number(query.get("extra") ?? 0); return ok({ plan: computePayoffPlan(debts.listByUser(userId).map(serializeDebt), strategy, extra) }); }
    if (!id && method === "POST") { const d = debts.create({ userId, name: body.name, kind: body.kind ?? "credit_card", icon: body.icon ?? "💳", color: body.color ?? "#FF0033", balance: body.balance, aprBps: body.aprBps ?? 0, minimumPayment: body.minimumPayment ?? 0 }); return ok({ debt: serializeDebt(d) }, 201); }
    if (id && method === "PATCH") { const e = debts.findForUser(userId, id); if (!e) return err(404, "Debt not found"); return ok({ debt: serializeDebt(debts.update(e.id, body)) }); }
    if (id && method === "DELETE") { const e = debts.findForUser(userId, id); if (!e) return err(404, "Debt not found"); debts.remove(e.id); return ok(undefined, 204); }
  }

  /* ---------- dashboard ---------- */
  if (root === "dashboard" && method === "GET") {
    const month = query.get("month") && isMonth(query.get("month")!) ? query.get("month")! : currentMonth();
    const b = balances(userId);
    const accountList = accounts.listByUser(userId, { activeOnly: true }).map((a) => serializeAccount(a, b.get(a.id) ?? a.openingBalance));
    const categoryList = categories.listByUser(userId).map(serializeCategory);
    const txList = transactions.allByUser(userId).map(serializeTransaction);
    const summary = buildBudgetSummary({ month, categories: categoryList, budgets: budgets.listByUserMonth(userId, month).map(serializeBudget), priorBudgets: budgets.listByUserMonth(userId, previousMonth(month)).map(serializeBudget), transactions: txList });
    const safeToSpend = computeSafeToSpend({ accounts: accountList, balances: b, budgetSummary: summary });
    const assets = sumCents(accountList.filter((a) => !LIABILITY_ACCOUNT_TYPES.has(a.type as AccountType)).map((a) => a.balance));
    const liabilities = sumCents(accountList.filter((a) => LIABILITY_ACCOUNT_TYPES.has(a.type as AccountType)).map((a) => a.balance));
    const inMonth = txList.filter((t) => !t.pending && t.date.slice(0, 7) === month);
    const incomeThisMonth = sumCents(inMonth.filter((t) => t.type === "income").map((t) => t.amount));
    const expensesThisMonth = sumCents(inMonth.filter((t) => t.type === "expense" && !t.excluded).map((t) => t.amount));
    const recent = [...txList].sort((a, c) => (a.date < c.date ? 1 : a.date > c.date ? -1 : c.createdAt.localeCompare(a.createdAt))).slice(0, 8);
    return ok({ month, accounts: accountList, netWorth: { assets, liabilities, total: assets - liabilities }, safeToSpend, cashflow: { income: incomeThisMonth, expenses: expensesThisMonth, net: incomeThisMonth - expensesThisMonth }, budgetSummary: summary, spendBreakdown: categorySpendBreakdown(categoryList, txList, month), recentTransactions: recent });
  }

  /* ---------- subscription / account (offline = free base tier) ---------- */
  if (root === "subscription") {
    if (id === "plans") return ok({ tiers: TIERS, features: FEATURES });
    if (method === "GET") return ok({ tierId: "base", entitlements: resolveEntitlements("base") });
    if (method === "PUT") return err(403, "Plans are managed on budgetsmarttme.com.");
  }
  if (root === "account") {
    if (sub === undefined && !id && method === "GET") return ok({ linked: false });
    if (id === "sync" && method === "POST") return ok({ linked: false });
    if (id === "unlink" && method === "POST") return ok({ linked: false });
  }

  return err(404, `Offline: ${method} /api/${seg.join("/")} isn't available yet`);
}
