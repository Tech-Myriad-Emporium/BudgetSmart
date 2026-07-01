// Seed a demo user with realistic data. Re-running wipes & recreates the demo user.
import { currentMonth, previousMonth, toCents } from "@budgetsmart/shared";
import bcrypt from "bcryptjs";
import { DEFAULT_CATEGORIES } from "../features/categories/defaults.js";
import { db, initSchema } from "./database.js";
import { accounts, budgets, categories, debts, family, goals, holdings, transactions, users } from "./repo.js";

/** ISO date `n` months from today (UTC). */
const monthsOut = (n: number): string => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

const DEMO_EMAIL = "demo@budgetsmart.app";
const DEMO_PASSWORD = "demo1234";

const month = currentMonth();
const prior = previousMonth(month);
const day = (m: string, d: number) => `${m}-${String(d).padStart(2, "0")}`;

function run() {
  initSchema();

  // Fresh start for the demo user (cascade deletes all their data).
  const existing = users.findByEmail(DEMO_EMAIL);
  if (existing) db.prepare("DELETE FROM users WHERE id = ?").run(existing.id);

  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const user = users.create({ email: DEMO_EMAIL, passwordHash, name: "Alex", currency: "USD" });
  // Put the demo account on Family T3 so every feature (incl. family) is explorable.
  users.setTier(user.id, "fam_t3");

  // --- Accounts ---
  const checking = accounts.create({ userId: user.id, name: "Everyday Checking", type: "checking", openingBalance: toCents(2400), currency: "USD" });
  const savings = accounts.create({ userId: user.id, name: "High-Yield Savings", type: "savings", openingBalance: toCents(11500), currency: "USD" });
  const credit = accounts.create({ userId: user.id, name: "Neon Rewards Card", type: "credit", openingBalance: toCents(640), currency: "USD" });
  const cash = accounts.create({ userId: user.id, name: "Wallet Cash", type: "cash", openingBalance: toCents(85), currency: "USD" });

  // --- Categories (the same starter set new users get) ---
  categories.createMany(DEFAULT_CATEGORIES.map((c) => ({ ...c, userId: user.id })));
  const cats = categories.listByUser(user.id);
  const cat = (name: string) => {
    const found = cats.find((c) => c.name === name);
    if (!found) throw new Error(`Missing seed category: ${name}`);
    return found.id;
  };

  // --- Budgets (this month + prior month so rollover has something to work with) ---
  const budgetPlan: Array<[string, number]> = [
    ["Groceries", 600],
    ["Rent", 1800],
    ["Utilities", 220],
    ["Dining Out", 280],
    ["Transport", 180],
    ["Subscriptions", 90],
    ["Shopping", 250],
    ["Entertainment", 120],
    ["Savings", 800],
  ];
  for (const [name, limit] of budgetPlan) {
    budgets.upsert(user.id, cat(name), month, toCents(limit));
    budgets.upsert(user.id, cat(name), prior, toCents(limit));
  }

  // --- Transactions ---
  interface T {
    acct: string;
    cat?: string;
    type: "income" | "expense" | "transfer";
    amount: number;
    merchant: string;
    date: string;
    to?: string;
    tags?: string[];
    note?: string;
    pending?: boolean;
  }

  const tx: T[] = [
    // Prior month
    { acct: checking.id, cat: cat("Salary"), type: "income", amount: 4200, merchant: "Acme Corp Payroll", date: day(prior, 1) },
    { acct: checking.id, cat: cat("Rent"), type: "expense", amount: 1800, merchant: "Skyline Apartments", date: day(prior, 3) },
    { acct: credit.id, cat: cat("Groceries"), type: "expense", amount: 540, merchant: "Whole Foods", date: day(prior, 8) },
    { acct: credit.id, cat: cat("Dining Out"), type: "expense", amount: 210, merchant: "Ramen Bar", date: day(prior, 14) },
    { acct: checking.id, cat: cat("Utilities"), type: "expense", amount: 205, merchant: "City Power & Water", date: day(prior, 18) },
    { acct: credit.id, cat: cat("Shopping"), type: "expense", amount: 320, merchant: "Uniqlo", date: day(prior, 22) },

    // This month — income
    { acct: checking.id, cat: cat("Salary"), type: "income", amount: 4200, merchant: "Acme Corp Payroll", date: day(month, 1) },
    { acct: checking.id, cat: cat("Side Income"), type: "income", amount: 350, merchant: "Freelance Invoice #14", date: day(month, 12), tags: ["freelance"] },

    // This month — fixed
    { acct: checking.id, cat: cat("Rent"), type: "expense", amount: 1800, merchant: "Skyline Apartments", date: day(month, 2) },
    { acct: checking.id, cat: cat("Utilities"), type: "expense", amount: 142.5, merchant: "City Power & Water", date: day(month, 6) },

    // This month — variable
    { acct: credit.id, cat: cat("Groceries"), type: "expense", amount: 86.4, merchant: "Trader Joe's", date: day(month, 4) },
    { acct: credit.id, cat: cat("Groceries"), type: "expense", amount: 124.1, merchant: "Whole Foods", date: day(month, 11) },
    { acct: cash.id, cat: cat("Groceries"), type: "expense", amount: 32.75, merchant: "Corner Market", date: day(month, 16) },
    { acct: credit.id, cat: cat("Dining Out"), type: "expense", amount: 48.2, merchant: "Sushi Place", date: day(month, 5), tags: ["date-night"] },
    { acct: credit.id, cat: cat("Dining Out"), type: "expense", amount: 23.5, merchant: "Blue Bottle Coffee", date: day(month, 9) },
    { acct: credit.id, cat: cat("Dining Out"), type: "expense", amount: 64.0, merchant: "Taco Cantina", date: day(month, 15) },
    { acct: credit.id, cat: cat("Transport"), type: "expense", amount: 42.0, merchant: "Shell Gas", date: day(month, 7) },
    { acct: cash.id, cat: cat("Transport"), type: "expense", amount: 18.5, merchant: "Metro Transit", date: day(month, 13) },
    { acct: credit.id, cat: cat("Shopping"), type: "expense", amount: 89.99, merchant: "Amazon", date: day(month, 10), tags: ["online"] },
    { acct: credit.id, cat: cat("Entertainment"), type: "expense", amount: 36.0, merchant: "AMC Theatres", date: day(month, 17), tags: ["date-night"] },
    { acct: credit.id, cat: cat("Health"), type: "expense", amount: 55.0, merchant: "CVS Pharmacy", date: day(month, 8) },
    { acct: checking.id, cat: cat("Dining Out"), type: "expense", amount: 12.4, merchant: "Street Food", date: day(month, 19), pending: true },

    // This month — transfers & savings
    { acct: checking.id, type: "transfer", amount: 800, merchant: "Monthly auto-save", date: day(month, 2), to: savings.id, note: "Pay yourself first" },
    { acct: checking.id, type: "transfer", amount: 500, merchant: "Card payment", date: day(month, 6), to: credit.id },
  ];

  for (const t of tx) {
    transactions.create({
      userId: user.id,
      accountId: t.acct,
      transferAccountId: t.type === "transfer" ? t.to ?? null : null,
      categoryId: t.type === "transfer" ? null : t.cat ?? null,
      type: t.type,
      amount: toCents(t.amount),
      merchant: t.merchant,
      note: t.note ?? null,
      date: t.date,
      pending: t.pending ?? false,
      excluded: false,
      tags: JSON.stringify(t.tags ?? []),
    });
  }

  // --- Recurring subscription history (drives the Recurring detector) ---
  const lastMonths: string[] = [month];
  for (let i = 1; i < 6; i++) lastMonths.push(previousMonth(lastMonths[lastMonths.length - 1]!));
  const subs = [
    { merchant: "Netflix", amount: 15.99, dom: 3 },
    { merchant: "Spotify", amount: 10.99, dom: 5 },
    { merchant: "Planet Fitness", amount: 24.99, dom: 12 },
    { merchant: "iCloud+", amount: 2.99, dom: 8 },
  ];
  for (const m of lastMonths) {
    for (const s of subs) {
      transactions.create({
        userId: user.id,
        accountId: checking.id,
        transferAccountId: null,
        categoryId: cat("Subscriptions"),
        type: "expense",
        amount: toCents(s.amount),
        merchant: s.merchant,
        note: null,
        date: day(m, s.dom),
        pending: false,
        excluded: false,
        tags: JSON.stringify(["subscription"]),
      });
    }
  }

  // --- Goals ---
  const goalSeed = [
    { name: "Emergency Fund", type: "savings", icon: "🛟", color: "#00FF41", targetAmount: 1000000, currentAmount: 620000, targetDate: monthsOut(8), monthlyContribution: 50000, priority: 0 },
    { name: "Japan Trip", type: "savings", icon: "✈️", color: "#00E0FF", targetAmount: 450000, currentAmount: 180000, targetDate: monthsOut(6), monthlyContribution: 40000, priority: 1 },
    { name: "Pay Off Credit Card", type: "debt", icon: "💳", color: "#FF0033", targetAmount: 177919, currentAmount: 50000, targetDate: monthsOut(4), monthlyContribution: 30000, priority: 2 },
    { name: "New Laptop", type: "custom", icon: "💻", color: "#B388FF", targetAmount: 250000, currentAmount: 250000, targetDate: monthsOut(2), monthlyContribution: 0, priority: 3 },
  ] as const;
  for (const g of goalSeed) {
    goals.create({ userId: user.id, note: null, ...g });
  }

  // --- Debts ---
  // NB: the credit card is already a liability *account* (with transactions), so it is
  // not duplicated here — debts represent liabilities not tracked as accounts.
  const debtSeed = [
    { name: "Student Loan", kind: "student_loan", icon: "🎓", color: "#00E0FF", balance: 1840000, aprBps: 549, minimumPayment: 21000 },
    { name: "Auto Loan", kind: "auto", icon: "🚗", color: "#B388FF", balance: 920000, aprBps: 689, minimumPayment: 31000 },
    { name: "Medical Bill", kind: "medical", icon: "🩺", color: "#FFD600", balance: 142000, aprBps: 0, minimumPayment: 5000 },
  ] as const;
  for (const d of debtSeed) {
    debts.create({ userId: user.id, ...d });
  }

  // --- Holdings (investments) ---
  const holdingSeed = [
    { name: "S&P 500 Index", symbol: "VOO", assetClass: "etf", accountLabel: "Roth IRA", quantity: 28, costBasis: 1080000, currentPrice: 47500 },
    { name: "Total Market", symbol: "VTI", assetClass: "etf", accountLabel: "401(k)", quantity: 60, costBasis: 1320000, currentPrice: 26200 },
    { name: "Apple Inc.", symbol: "AAPL", assetClass: "stock", accountLabel: "Brokerage", quantity: 25, costBasis: 380000, currentPrice: 21500 },
    { name: "NVIDIA", symbol: "NVDA", assetClass: "stock", accountLabel: "Brokerage", quantity: 10, costBasis: 90000, currentPrice: 13800 },
    { name: "Bitcoin", symbol: "BTC", assetClass: "crypto", accountLabel: "Cold Wallet", quantity: 0.35, costBasis: 1200000, currentPrice: 6450000 },
    { name: "Treasury Bonds", symbol: "BND", assetClass: "bond", accountLabel: "401(k)", quantity: 40, costBasis: 300000, currentPrice: 7300 },
  ] as const;
  for (const h of holdingSeed) {
    holdings.create({ userId: user.id, ...h });
  }

  // --- Family members (the demo is on a Family plan) ---
  const today = new Date().toISOString().slice(0, 10);
  const familySeed = [
    { name: "Jordan", role: "teen", color: "#00E0FF", allowance: 12000, spend: 4350, invest: 2000 },
    { name: "Riley", role: "child", color: "#FF7A00", allowance: 6000, spend: 1875, invest: 0 },
    { name: "Sam", role: "partner", color: "#B388FF", allowance: 0, spend: 0, invest: 0 },
  ] as const;
  for (const f of familySeed) {
    const m = family.addMember({ ownerId: user.id, name: f.name, role: f.role, color: f.color });
    if (f.allowance) family.addLedgerEntry({ ownerId: user.id, memberId: m.id, kind: "allowance", amount: f.allowance, note: "Monthly allowance", date: today });
    if (f.spend) family.addLedgerEntry({ ownerId: user.id, memberId: m.id, kind: "spend", amount: f.spend, note: "Snacks & games", date: today });
    if (f.invest) family.addLedgerEntry({ ownerId: user.id, memberId: m.id, kind: "invest", amount: f.invest, note: "Starter ETF", date: today });
  }

  const count = transactions.allByUser(user.id).length;
  console.log(`\x1b[32m✓ Seeded\x1b[0m ${DEMO_EMAIL} — ${cats.length} categories, ${count} transactions, ${budgetPlan.length} budgets, ${goalSeed.length} goals, ${debtSeed.length} debts, ${holdingSeed.length} holdings, ${familySeed.length} family members.`);
  console.log(`  Login:  ${DEMO_EMAIL}  /  ${DEMO_PASSWORD}`);
}

run();
db.close(); // flush + release the file so the next process sees a complete db
