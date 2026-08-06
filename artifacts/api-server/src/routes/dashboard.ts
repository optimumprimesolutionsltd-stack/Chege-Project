import { Router } from "express";
import { db } from "@workspace/db";
import {
  expensesTable,
  contributionsTable,
  budgetCategoriesTable,
  usersTable,
} from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { GetDashboardSummaryQueryParams, GetDashboardCategoryBreakdownQueryParams } from "@workspace/api-zod";

const CHEGE_TARGET = 267094;
const LYDIAH_TARGET = 50000;
const TOTAL_BUDGET = 317094;

const router = Router();

router.get("/dashboard/summary", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const now = new Date();
  const parsed = GetDashboardSummaryQueryParams.safeParse(req.query);
  const month = parsed.success && parsed.data.month != null ? Math.round(parsed.data.month) : now.getMonth() + 1;
  const year = parsed.success && parsed.data.year != null ? Math.round(parsed.data.year) : now.getFullYear();

  // Total spent this month
  const [spentRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${expensesTable.amount}), 0)` })
    .from(expensesTable)
    .where(
      sql`EXTRACT(MONTH FROM ${expensesTable.date}) = ${month} AND EXTRACT(YEAR FROM ${expensesTable.date}) = ${year}`,
    );

  // Expense count
  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(expensesTable)
    .where(
      sql`EXTRACT(MONTH FROM ${expensesTable.date}) = ${month} AND EXTRACT(YEAR FROM ${expensesTable.date}) = ${year}`,
    );

  // Contributions this month per user
  const contribs = await db
    .select({
      userId: contributionsTable.userId,
      total: sql<number>`COALESCE(SUM(${contributionsTable.amount}), 0)`,
    })
    .from(contributionsTable)
    .where(
      sql`${contributionsTable.month} = ${month} AND ${contributionsTable.year} = ${year}`,
    )
    .groupBy(contributionsTable.userId);

  // Look up names to figure out chege vs lydiah
  const users = await db.select().from(usersTable);
  
  // Identify users by role stored in claims or by first name match
  let chegeContributed = 0;
  let lydiahContributed = 0;

  for (const c of contribs) {
    const user = users.find((u) => u.id === c.userId);
    const name = (user?.firstName ?? "").toLowerCase();
    if (name.includes("chege") || name.includes("george")) {
      chegeContributed += Number(c.total);
    } else if (name.includes("lydiah") || name.includes("lydia")) {
      lydiahContributed += Number(c.total);
    } else {
      // Default assignment by contribution order — first user is Chege
      if (chegeContributed === 0) chegeContributed += Number(c.total);
      else lydiahContributed += Number(c.total);
    }
  }

  const totalSpent = Number(spentRow.total);
  const expenseCount = Number(countRow.count);

  res.json({
    month,
    year,
    totalBudget: TOTAL_BUDGET,
    totalSpent,
    remaining: TOTAL_BUDGET - totalSpent,
    chegeContributed,
    lydiahContributed,
    chegeTarget: CHEGE_TARGET,
    lydiahTarget: LYDIAH_TARGET,
    expenseCount,
  });
});

router.get("/dashboard/activity", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Last 20 expenses
  const expenses = await db
    .select({
      id: expensesTable.id,
      amount: expensesTable.amount,
      category: expensesTable.category,
      description: expensesTable.description,
      paidById: expensesTable.paidById,
      paidByName: usersTable.firstName,
      date: expensesTable.date,
      createdAt: expensesTable.createdAt,
    })
    .from(expensesTable)
    .leftJoin(usersTable, eq(expensesTable.paidById, usersTable.id))
    .orderBy(sql`${expensesTable.createdAt} DESC`)
    .limit(10);

  // Last 10 contributions
  const contributions = await db
    .select({
      id: contributionsTable.id,
      amount: contributionsTable.amount,
      userId: contributionsTable.userId,
      userName: usersTable.firstName,
      month: contributionsTable.month,
      year: contributionsTable.year,
      createdAt: contributionsTable.createdAt,
    })
    .from(contributionsTable)
    .leftJoin(usersTable, eq(contributionsTable.userId, usersTable.id))
    .orderBy(sql`${contributionsTable.createdAt} DESC`)
    .limit(10);

  const items = [
    ...expenses.map((e) => ({
      id: `expense-${e.id}`,
      type: "expense",
      amount: e.amount,
      description: e.description,
      userName: e.paidByName ?? "Unknown",
      category: e.category,
      date: e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
    })),
    ...contributions.map((c) => ({
      id: `contribution-${c.id}`,
      type: "contribution",
      amount: c.amount,
      description: `Contribution for ${new Date(c.year, c.month - 1).toLocaleString("default", { month: "long" })} ${c.year}`,
      userName: c.userName ?? "Unknown",
      category: null,
      date: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 20);

  res.json(items);
});

router.get("/dashboard/category-breakdown", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const now = new Date();
  const parsed = GetDashboardCategoryBreakdownQueryParams.safeParse(req.query);
  const month = parsed.success && parsed.data.month != null ? Math.round(parsed.data.month) : now.getMonth() + 1;
  const year = parsed.success && parsed.data.year != null ? Math.round(parsed.data.year) : now.getFullYear();

  const categories = await db.select().from(budgetCategoriesTable).orderBy(budgetCategoriesTable.priority);

  const spentByCategory = await db
    .select({
      category: expensesTable.category,
      total: sql<number>`COALESCE(SUM(${expensesTable.amount}), 0)`,
    })
    .from(expensesTable)
    .where(
      sql`EXTRACT(MONTH FROM ${expensesTable.date}) = ${month} AND EXTRACT(YEAR FROM ${expensesTable.date}) = ${year}`,
    )
    .groupBy(expensesTable.category);

  const spentMap = new Map(spentByCategory.map((s) => [s.category, Number(s.total)]));

  const breakdown = categories.map((cat) => {
    const spentAmount = spentMap.get(cat.name) ?? 0;
    const remaining = cat.budgetAmount - spentAmount;
    const percentUsed = cat.budgetAmount > 0 ? (spentAmount / cat.budgetAmount) * 100 : 0;
    return {
      category: cat.name,
      budgetAmount: cat.budgetAmount,
      spentAmount,
      remaining,
      percentUsed: Math.round(percentUsed * 10) / 10,
      priority: cat.priority,
      color: cat.color,
    };
  });

  res.json(breakdown);
});

export default router;
