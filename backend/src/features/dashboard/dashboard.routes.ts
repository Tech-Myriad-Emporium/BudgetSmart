import {
  LIABILITY_ACCOUNT_TYPES,
  buildBudgetSummary,
  categorySpendBreakdown,
  computeSafeToSpend,
  currentMonth,
  isMonth,
  previousMonth,
  sumCents,
  type AccountType,
} from "@budgetsmart/shared";
import { Router } from "express";
import { z } from "zod";
import { accounts, budgets, categories, transactions } from "../../db/repo.js";
import { computeBalancesForUser } from "../../lib/balances.js";
import { asyncHandler } from "../../lib/http.js";
import { serializeAccount, serializeBudget, serializeCategory, serializeTransaction } from "../../lib/serialize.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";

const monthSchema = z.string().refine(isMonth, "Month must be YYYY-MM");

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const month = monthSchema.parse(req.query.month ?? currentMonth());
    const prior = previousMonth(month);

    const balances = computeBalancesForUser(userId);
    const accountList = accounts
      .listByUser(userId, { activeOnly: true })
      .map((a) => serializeAccount(a, balances.get(a.id) ?? a.openingBalance));
    const categoryList = categories.listByUser(userId).map(serializeCategory);
    const txList = transactions.allByUser(userId).map(serializeTransaction);

    const summary = buildBudgetSummary({
      month,
      categories: categoryList,
      budgets: budgets.listByUserMonth(userId, month).map(serializeBudget),
      priorBudgets: budgets.listByUserMonth(userId, prior).map(serializeBudget),
      transactions: txList,
    });

    const safeToSpend = computeSafeToSpend({ accounts: accountList, balances, budgetSummary: summary });

    const assets = sumCents(
      accountList.filter((a) => !LIABILITY_ACCOUNT_TYPES.has(a.type as AccountType)).map((a) => a.balance),
    );
    const liabilities = sumCents(
      accountList.filter((a) => LIABILITY_ACCOUNT_TYPES.has(a.type as AccountType)).map((a) => a.balance),
    );

    const inMonth = txList.filter((t) => !t.pending && t.date.slice(0, 7) === month);
    const incomeThisMonth = sumCents(inMonth.filter((t) => t.type === "income").map((t) => t.amount));
    const expensesThisMonth = sumCents(
      inMonth.filter((t) => t.type === "expense" && !t.excluded).map((t) => t.amount),
    );

    const spendBreakdown = categorySpendBreakdown(categoryList, txList, month);

    const recent = [...txList]
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt.localeCompare(a.createdAt)))
      .slice(0, 8);

    res.json({
      month,
      accounts: accountList,
      netWorth: { assets, liabilities, total: assets - liabilities },
      safeToSpend,
      cashflow: {
        income: incomeThisMonth,
        expenses: expensesThisMonth,
        net: incomeThisMonth - expensesThisMonth,
      },
      budgetSummary: summary,
      spendBreakdown,
      recentTransactions: recent,
    });
  }),
);
