import { Router } from "express";
import { db } from "@workspace/db";
import {
  expensesTable,
  budgetCategoriesTable,
  usersTable,
  jointAccountTxTable,
  savingsGoalContributionsTable,
  savingsGoalsTable,
} from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { GetDashboardSummaryQueryParams, GetDashboardCategoryBreakdownQueryParams } from "@workspace/api-zod";

const CHEGE_TARGET = 267094;
const LYDIAH_TARGET = 50000;

const router = Router();

router.get("/dashboard/summary", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const now = new Date();
  const parsed = GetDashboardSummaryQueryParams.safeParse(req.query);
  const month = parsed.success && parsed.data.month != null ? Math.round(parsed.data.month) : now.getMonth() + 1;
  const year = parsed.success && parsed.data.year != null ? Math.round(parsed.data.year) : now.getFullYear();

  // Sum budget_categories for the live total — never hardcoded
  const [budgetRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${budgetCategoriesTable.budgetAmount}), 0)` })
    .from(budgetCategoriesTable);
  const totalBudget = Number(budgetRow.total);

  const [spentRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${expensesTable.amount}), 0)` })
    .from(expensesTable)
    .where(sql`EXTRACT(MONTH FROM ${expensesTable.date}) = ${month} AND EXTRACT(YEAR FROM ${expensesTable.date}) = ${year}`);

  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(expensesTable)
    .where(sql`EXTRACT(MONTH FROM ${expensesTable.date}) = ${month} AND EXTRACT(YEAR FROM ${expensesTable.date}) = ${year}`);

  // Disbursements tagged to an expense category also count as spending
  const [categorisedDisbursementsRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${jointAccountTxTable.amount}), 0)` })
    .from(jointAccountTxTable)
    .where(sql`${jointAccountTxTable.type} = 'disbursement' AND ${jointAccountTxTable.expenseCategory} IS NOT NULL AND EXTRACT(MONTH FROM ${jointAccountTxTable.date}) = ${month} AND EXTRACT(YEAR FROM ${jointAccountTxTable.date}) = ${year}`);

  // Contributions = expenses paid + bank deposits + savings goal contributions
  //
  // Expense contribution logic (split-aware):
  //   • If the expense has income splits → only the non-bank split amounts count
  //   • If no splits → full amount counts when paidFromBank = false
  const [expenseContribs, depositContribs, savingsContribs] = await Promise.all([
    db.execute(sql`
      SELECT e.paid_by_id AS "userId",
             COALESCE(SUM(
               CASE
                 WHEN EXISTS (
                   SELECT 1 FROM expense_income_splits s WHERE s.expense_id = e.id
                 )
                 THEN (
                   SELECT COALESCE(SUM(s.amount), 0)
                   FROM expense_income_splits s
                   WHERE s.expense_id = e.id AND s.from_bank = false
                 )
                 ELSE CASE WHEN e.paid_from_bank = false THEN e.amount ELSE 0 END
               END
             ), 0) AS total
      FROM expenses e
      WHERE EXTRACT(MONTH FROM e.date) = ${month}
        AND EXTRACT(YEAR  FROM e.date) = ${year}
      GROUP BY e.paid_by_id
    `).then(r => (r.rows as { userId: string; total: string }[]).map(x => ({ userId: x.userId, total: Number(x.total) }))),

    db.select({
      userId: jointAccountTxTable.madeById,
      total: sql<number>`COALESCE(SUM(${jointAccountTxTable.amount}), 0)`,
    })
    .from(jointAccountTxTable)
    .where(sql`${jointAccountTxTable.type} = 'deposit' AND ${jointAccountTxTable.madeById} IS NOT NULL AND EXTRACT(MONTH FROM ${jointAccountTxTable.date}) = ${month} AND EXTRACT(YEAR FROM ${jointAccountTxTable.date}) = ${year}`)
    .groupBy(jointAccountTxTable.madeById),

    db.select({
      userId: savingsGoalContributionsTable.createdByUserId,
      total: sql<number>`COALESCE(SUM(${savingsGoalContributionsTable.amount}), 0)`,
    })
    .from(savingsGoalContributionsTable)
    .where(sql`EXTRACT(MONTH FROM ${savingsGoalContributionsTable.createdAt}) = ${month} AND EXTRACT(YEAR FROM ${savingsGoalContributionsTable.createdAt}) = ${year}`)
    .groupBy(savingsGoalContributionsTable.createdByUserId),
  ]);

  const contribMap = new Map<string, number>();
  for (const r of [...expenseContribs, ...depositContribs, ...savingsContribs]) {
    const uid = (r as { userId: string | null }).userId;
    if (uid) contribMap.set(uid, (contribMap.get(uid) ?? 0) + Number(r.total));
  }
  const contribs = Array.from(contribMap.entries()).map(([userId, total]) => ({ userId, total }));

  // Per-person spending breakdown
  const memberExpenses = await db
    .select({
      userId: expensesTable.paidById,
      total: sql<number>`COALESCE(SUM(${expensesTable.amount}), 0)`,
    })
    .from(expensesTable)
    .where(sql`EXTRACT(MONTH FROM ${expensesTable.date}) = ${month} AND EXTRACT(YEAR FROM ${expensesTable.date}) = ${year}`)
    .groupBy(expensesTable.paidById);

  const users = await db.select().from(usersTable);

  // Identify Chege and Lydiah by name OR email (firstName may be null if they
  // haven't logged in since the profile-save was added, so email is the reliable fallback)
  const isChege = (u?: typeof usersTable.$inferSelect | null) => {
    const n = (u?.firstName ?? "").toLowerCase();
    const e = (u?.email ?? "").toLowerCase();
    return n.includes("chege") || n.includes("george") || n.includes("frederick") || e.includes("mundarafrederick");
  };
  const isLydiah = (u?: typeof usersTable.$inferSelect | null) => {
    const n = (u?.firstName ?? "").toLowerCase();
    const e = (u?.email ?? "").toLowerCase();
    return n.includes("lydiah") || n.includes("lydia") || e.includes("lydiah");
  };

  let chegeContributed = 0;
  let lydiahContributed = 0;
  let chegeSpent = 0;
  let lydiahSpent = 0;

  for (const c of contribs) {
    const user = users.find((u) => u.id === c.userId);
    if (isChege(user)) chegeContributed += Number(c.total);
    else if (isLydiah(user)) lydiahContributed += Number(c.total);
    else if (chegeContributed === 0) chegeContributed += Number(c.total);
    else lydiahContributed += Number(c.total);
  }

  for (const e of memberExpenses) {
    const user = users.find((u) => u.id === e.userId);
    if (isChege(user)) chegeSpent += Number(e.total);
    else if (isLydiah(user)) lydiahSpent += Number(e.total);
    else if (chegeSpent === 0) chegeSpent += Number(e.total);
    else lydiahSpent += Number(e.total);
  }

  const totalSpent = Number(spentRow.total) + Number(categorisedDisbursementsRow.total);
  res.json({
    month, year,
    totalBudget,
    totalSpent,
    remaining: totalBudget - totalSpent,
    chegeContributed,
    lydiahContributed,
    chegeSpent,
    lydiahSpent,
    chegeNet: chegeContributed - chegeSpent,
    lydiahNet: lydiahContributed - lydiahSpent,
    chegeTarget: CHEGE_TARGET,
    lydiahTarget: LYDIAH_TARGET,
    expenseCount: Number(countRow.count),
  });
});

// Per-member contribution breakdown (individual transactions)
router.get("/dashboard/member-breakdown", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const userId = (req.query.userId as string) ?? "";
  const now = new Date();
  const month = parseInt(req.query.month as string) || now.getMonth() + 1;
  const year  = parseInt(req.query.year  as string) || now.getFullYear();

  if (!userId) { res.status(400).json({ error: "userId required" }); return; }

  const [expenses, deposits, savings] = await Promise.all([
    db.select({
      id: expensesTable.id,
      description: expensesTable.description,
      amount: expensesTable.amount,
      category: expensesTable.category,
      date: expensesTable.date,
      paidFromBank: expensesTable.paidFromBank,
    })
    .from(expensesTable)
    .where(sql`${expensesTable.paidById} = ${userId}
           AND EXTRACT(MONTH FROM ${expensesTable.date}) = ${month}
           AND EXTRACT(YEAR  FROM ${expensesTable.date}) = ${year}
           AND ${expensesTable.paidFromBank} = false`)
    .orderBy(sql`${expensesTable.date} DESC`),

    db.select({
      id: jointAccountTxTable.id,
      description: jointAccountTxTable.description,
      amount: jointAccountTxTable.amount,
      date: jointAccountTxTable.date,
    })
    .from(jointAccountTxTable)
    .where(sql`${jointAccountTxTable.type} = 'deposit'
           AND ${jointAccountTxTable.madeById} = ${userId}
           AND EXTRACT(MONTH FROM ${jointAccountTxTable.date}) = ${month}
           AND EXTRACT(YEAR  FROM ${jointAccountTxTable.date}) = ${year}`)
    .orderBy(sql`${jointAccountTxTable.date} DESC`),

    db.select({
      id: savingsGoalContributionsTable.id,
      goalName: savingsGoalsTable.name,
      amount: savingsGoalContributionsTable.amount,
      date: savingsGoalContributionsTable.createdAt,
    })
    .from(savingsGoalContributionsTable)
    .leftJoin(savingsGoalsTable, eq(savingsGoalContributionsTable.goalId, savingsGoalsTable.id))
    .where(sql`${savingsGoalContributionsTable.createdByUserId} = ${userId}
           AND EXTRACT(MONTH FROM ${savingsGoalContributionsTable.createdAt}) = ${month}
           AND EXTRACT(YEAR  FROM ${savingsGoalContributionsTable.createdAt}) = ${year}`)
    .orderBy(sql`${savingsGoalContributionsTable.createdAt} DESC`),
  ]);

  const expenseTotal  = expenses.reduce((s, r) => s + Number(r.amount), 0);
  const depositTotal  = deposits.reduce((s, r) => s + Number(r.amount), 0);
  const savingsTotal  = savings.reduce((s,  r) => s + Number(r.amount), 0);

  res.json({
    expenses:  expenses.map(r => ({ ...r, amount: Number(r.amount), date: r.date ? String(r.date) : null })),
    deposits:  deposits.map(r => ({ ...r, amount: Number(r.amount), date: r.date ? String(r.date) : null })),
    savingsContributions: savings.map(r => ({ ...r, amount: Number(r.amount), date: r.date ? String(r.date) : null })),
    totals: { expenses: expenseTotal, deposits: depositTotal, savings: savingsTotal, grand: expenseTotal + depositTotal + savingsTotal },
  });
});

router.get("/dashboard/activity", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

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

  // Show recent deposits as contribution items in the activity feed
  const deposits = await db
    .select({
      id: jointAccountTxTable.id,
      amount: jointAccountTxTable.amount,
      description: jointAccountTxTable.description,
      madeById: jointAccountTxTable.madeById,
      madeByName: usersTable.firstName,
      createdAt: jointAccountTxTable.createdAt,
    })
    .from(jointAccountTxTable)
    .leftJoin(usersTable, eq(jointAccountTxTable.madeById, usersTable.id))
    .where(eq(jointAccountTxTable.type, "deposit"))
    .orderBy(sql`${jointAccountTxTable.createdAt} DESC`)
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
    ...deposits.map((d) => ({
      id: `contribution-${d.id}`,
      type: "contribution",
      amount: d.amount,
      description: `Bank deposit: ${d.description}`,
      userName: d.madeByName ?? "Unknown",
      category: null,
      date: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 20);

  res.json(items);
});

router.get("/dashboard/category-breakdown", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const now = new Date();
  const parsed = GetDashboardCategoryBreakdownQueryParams.safeParse(req.query);
  const month = parsed.success && parsed.data.month != null ? Math.round(parsed.data.month) : now.getMonth() + 1;
  const year = parsed.success && parsed.data.year != null ? Math.round(parsed.data.year) : now.getFullYear();

  const categories = await db.select().from(budgetCategoriesTable).orderBy(budgetCategoriesTable.priority);
  const spentByCategory = await db
    .select({ category: expensesTable.category, total: sql<number>`COALESCE(SUM(${expensesTable.amount}), 0)` })
    .from(expensesTable)
    .where(sql`EXTRACT(MONTH FROM ${expensesTable.date}) = ${month} AND EXTRACT(YEAR FROM ${expensesTable.date}) = ${year}`)
    .groupBy(expensesTable.category);

  // Also count disbursements that are tagged to an expense category
  const disbursementsByCategory = await db
    .select({
      category: jointAccountTxTable.expenseCategory,
      total: sql<number>`COALESCE(SUM(${jointAccountTxTable.amount}), 0)`,
    })
    .from(jointAccountTxTable)
    .where(sql`${jointAccountTxTable.type} = 'disbursement' AND ${jointAccountTxTable.expenseCategory} IS NOT NULL AND EXTRACT(MONTH FROM ${jointAccountTxTable.date}) = ${month} AND EXTRACT(YEAR FROM ${jointAccountTxTable.date}) = ${year}`)
    .groupBy(jointAccountTxTable.expenseCategory);

  const spentMap = new Map(spentByCategory.map((s) => [s.category, Number(s.total)]));
  const disbursementMap = new Map(disbursementsByCategory.map((d) => [d.category, Number(d.total)]));

  res.json(categories.map((cat) => {
    const spentAmount = (spentMap.get(cat.name) ?? 0) + (disbursementMap.get(cat.name) ?? 0);
    return {
      category: cat.name,
      budgetAmount: cat.budgetAmount,
      spentAmount,
      remaining: cat.budgetAmount - spentAmount,
      percentUsed: Math.round(cat.budgetAmount > 0 ? (spentAmount / cat.budgetAmount) * 100 * 10 : 0) / 10,
      priority: cat.priority,
      color: cat.color,
    };
  }));
});

router.get("/dashboard/trends", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const monthsBack = Math.min(Math.max(Number(req.query.months) || 6, 1), 12);
  const now = new Date();
  const results = [];

  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();

    const [spentRow] = await db
      .select({ total: sql<number>`COALESCE(SUM(${expensesTable.amount}), 0)`, count: sql<number>`COUNT(*)` })
      .from(expensesTable)
      .where(sql`EXTRACT(MONTH FROM ${expensesTable.date}) = ${m} AND EXTRACT(YEAR FROM ${expensesTable.date}) = ${y}`);

    results.push({
      month: m,
      year: y,
      label: d.toLocaleString("default", { month: "short", year: "numeric" }),
      totalSpent: Number(spentRow.total),
      expenseCount: Number(spentRow.count),
    });
  }

  res.json(results);
});

export default router;
