import { Router } from "express";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  budgetCategoriesTable,
  expensesTable,
  incomeSourcesTable,
  jointAccountTxTable,
  savingsGoalsTable,
  groupsTable,
} from "@workspace/db";
import { db } from "@workspace/db";
import { getActiveGroupId } from "../lib/activeGroup";
import { parseBudgetSummaryPeriod } from "../lib/ai-budget-summary";
import { generateAskJamviResponse, type AskJamviSummary } from "../lib/ask-jamvi-llm";

const router = Router();

router.get("/ai/budget-summary", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const { month, year } = parseBudgetSummaryPeriod(req.query);
  const monthFilter = sql`EXTRACT(MONTH FROM ${expensesTable.date}) = ${month} AND EXTRACT(YEAR FROM ${expensesTable.date}) = ${year}`;
  const transactionMonthFilter = sql`EXTRACT(MONTH FROM ${jointAccountTxTable.date}) = ${month} AND EXTRACT(YEAR FROM ${jointAccountTxTable.date}) = ${year}`;

  const [group, budgetRows, expenseTotal, categoryRows, incomeRow, goals, expenseLedger, bankLedger] = await Promise.all([
    db.select({ name: groupsTable.name, kind: groupsTable.kind, isPrivate: sql<boolean>`${groupsTable.privateOwnerUserId} IS NOT NULL` })
      .from(groupsTable).where(eq(groupsTable.id, groupId)).limit(1),
    db.select({ name: budgetCategoriesTable.name, budgetAmount: budgetCategoriesTable.budgetAmount, priority: budgetCategoriesTable.priority })
      .from(budgetCategoriesTable)
      .where(sql`${budgetCategoriesTable.groupId} = ${groupId} AND (${budgetCategoriesTable.isRecurring} = true OR (${budgetCategoriesTable.activeMonth} = ${month} AND ${budgetCategoriesTable.activeYear} = ${year}))`)
      .orderBy(budgetCategoriesTable.priority, budgetCategoriesTable.name),
    db.select({ total: sql<number>`COALESCE(SUM(${expensesTable.amount}), 0)` })
      .from(expensesTable).where(and(eq(expensesTable.groupId, groupId), monthFilter)),
    db.execute(sql`
      SELECT category, COALESCE(SUM(amount), 0) AS spent
      FROM (
        SELECT e.category, e.amount
        FROM expenses e
        WHERE e.group_id = ${groupId}
          AND EXTRACT(MONTH FROM e.date) = ${month}
          AND EXTRACT(YEAR FROM e.date) = ${year}
          AND NOT EXISTS (
            SELECT 1 FROM expense_category_allocations a
            WHERE a.expense_id = e.id AND a.group_id = ${groupId}
          )
        UNION ALL
        SELECT a.category, a.amount
        FROM expense_category_allocations a
        INNER JOIN expenses e ON e.id = a.expense_id AND e.group_id = a.group_id
        WHERE a.group_id = ${groupId}
          AND EXTRACT(MONTH FROM e.date) = ${month}
          AND EXTRACT(YEAR FROM e.date) = ${year}
      ) entries
      GROUP BY category
      ORDER BY spent DESC, category ASC
    `),
    db.select({ total: sql<number>`COALESCE(SUM(${jointAccountTxTable.amount}), 0)` })
      .from(jointAccountTxTable)
      .where(sql`${jointAccountTxTable.groupId} = ${groupId} AND ${jointAccountTxTable.type} = 'deposit' AND ${jointAccountTxTable.bankTransferId} IS NULL AND ${transactionMonthFilter}`),
    db.select({ name: savingsGoalsTable.name, targetAmount: savingsGoalsTable.targetAmount, currentAmount: savingsGoalsTable.currentAmount, deadline: savingsGoalsTable.deadline })
      .from(savingsGoalsTable).where(eq(savingsGoalsTable.groupId, groupId)).orderBy(savingsGoalsTable.deadline),
    db.select({
      id: expensesTable.id,
      date: expensesTable.date,
      description: expensesTable.description,
      category: expensesTable.category,
      amount: expensesTable.amount,
    }).from(expensesTable)
      .where(and(eq(expensesTable.groupId, groupId), monthFilter))
      .orderBy(desc(expensesTable.date), desc(expensesTable.id))
      .limit(100),
    db.select({
      id: jointAccountTxTable.id,
      date: jointAccountTxTable.date,
      description: jointAccountTxTable.description,
      category: jointAccountTxTable.expenseCategory,
      amount: jointAccountTxTable.amount,
      type: jointAccountTxTable.type,
    }).from(jointAccountTxTable)
      .where(and(eq(jointAccountTxTable.groupId, groupId), transactionMonthFilter))
      .orderBy(desc(jointAccountTxTable.date), desc(jointAccountTxTable.id))
      .limit(100),
  ]);

  const spentByCategory = new Map((categoryRows.rows as Array<{ category: string; spent: string | number }>).map((row) => [row.category, Number(row.spent)]));
  const categories = budgetRows.map((row) => ({
    name: row.name,
    priority: row.priority,
    budgeted: Number(row.budgetAmount),
    spent: spentByCategory.get(row.name) ?? 0,
    remaining: Number(row.budgetAmount) - (spentByCategory.get(row.name) ?? 0),
  }));
  const budgeted = categories.reduce((sum, row) => sum + row.budgeted, 0);
  const spent = Number(expenseTotal[0]?.total ?? 0);
  const income = Number(incomeRow[0]?.total ?? 0);

  res.json({
    period: { month, year, currency: "KES" },
    workspace: group[0] ?? { name: "Current budget", kind: "unknown", isPrivate: false },
    totals: { budgeted, spent, remaining: budgeted - spent, incomeReceived: income },
    categories,
    goals: goals.map((goal) => ({
      name: goal.name,
      targetAmount: Number(goal.targetAmount),
      currentAmount: Number(goal.currentAmount),
      remaining: Math.max(0, Number(goal.targetAmount) - Number(goal.currentAmount)),
      deadline: goal.deadline ? String(goal.deadline) : null,
    })),
    ledgerEntries: [
      ...expenseLedger.map((entry) => ({
        kind: "expense" as const,
        id: entry.id,
        date: String(entry.date),
        description: entry.description,
        category: entry.category,
        amount: Number(entry.amount),
        direction: "out" as const,
      })),
      ...bankLedger.map((entry) => ({
        kind: "bank" as const,
        id: entry.id,
        date: String(entry.date),
        description: entry.description,
        category: entry.category,
        amount: Number(entry.amount),
        direction: entry.type === "deposit" ? "in" as const : "out" as const,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date)),
    guardrails: {
      readOnly: true,
      savingsAndEmergencyFundsAreGoals: true,
      workspaceScoped: true,
    },
  });
});

router.get("/search", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const tab = typeof req.query.tab === "string" ? req.query.tab : "all";
  if (query.length < 2 || query.length > 120) {
    res.status(400).json({ error: "Search using 2 to 120 characters." });
    return;
  }
  const pattern = `%${query.replace(/[%_]/g, "\\$&")}%`;
  const include = (kind: string) => tab === "all" || tab === kind;
  const [expenses, bank, goals, income] = await Promise.all([
    include("expenses")
      ? db.select({
          id: expensesTable.id,
          date: expensesTable.date,
          title: expensesTable.description,
          subtitle: expensesTable.category,
          amount: expensesTable.amount,
        }).from(expensesTable)
          .where(and(
            eq(expensesTable.groupId, groupId),
            or(
              ilike(expensesTable.description, pattern),
              ilike(expensesTable.category, pattern),
              ilike(expensesTable.notes, pattern),
            ),
          ))
          .orderBy(desc(expensesTable.date), desc(expensesTable.id))
          .limit(50)
      : Promise.resolve([]),
    include("bank")
      ? db.select({
          id: jointAccountTxTable.id,
          date: jointAccountTxTable.date,
          title: jointAccountTxTable.description,
          subtitle: jointAccountTxTable.expenseCategory,
          amount: jointAccountTxTable.amount,
          type: jointAccountTxTable.type,
        }).from(jointAccountTxTable)
          .where(and(
            eq(jointAccountTxTable.groupId, groupId),
            or(
              ilike(jointAccountTxTable.description, pattern),
              ilike(jointAccountTxTable.expenseCategory, pattern),
            ),
          ))
          .orderBy(desc(jointAccountTxTable.date), desc(jointAccountTxTable.id))
          .limit(50)
      : Promise.resolve([]),
    include("goals")
      ? db.select({
          id: savingsGoalsTable.id,
          date: savingsGoalsTable.deadline,
          title: savingsGoalsTable.name,
          amount: savingsGoalsTable.currentAmount,
          targetAmount: savingsGoalsTable.targetAmount,
        }).from(savingsGoalsTable)
          .where(and(eq(savingsGoalsTable.groupId, groupId), ilike(savingsGoalsTable.name, pattern)))
          .orderBy(desc(savingsGoalsTable.createdAt))
          .limit(50)
      : Promise.resolve([]),
    include("income")
      ? db.select({
          id: incomeSourcesTable.id,
          date: incomeSourcesTable.createdAt,
          title: incomeSourcesTable.name,
          amount: incomeSourcesTable.expectedMonthlyAmount,
        }).from(incomeSourcesTable)
          .where(and(eq(incomeSourcesTable.groupId, groupId), ilike(incomeSourcesTable.name, pattern)))
          .orderBy(desc(incomeSourcesTable.createdAt))
          .limit(50)
      : Promise.resolve([]),
  ]);
  res.json({
    query,
    tab,
    results: [
      ...expenses.map((item) => ({ ...item, kind: "expenses", subtitle: item.subtitle || "Expense" })),
      ...bank.map((item) => ({
        ...item,
        kind: "bank",
        subtitle: item.subtitle || (item.type === "deposit" ? "Bank deposit" : "Bank payment"),
        direction: item.type === "deposit" ? "in" : "out",
      })),
      ...goals.map((item) => ({
        ...item,
        kind: "goals",
        subtitle: `Goal · KES ${Number(item.amount).toLocaleString("en-KE")} of KES ${Number(item.targetAmount).toLocaleString("en-KE")}`,
      })),
      ...income.map((item) => ({ ...item, kind: "income", subtitle: "Income source · monthly target" })),
    ].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? ""))),
  });
});

router.post("/ai/ask", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  if (!question || question.length > 500) {
    res.status(400).json({ error: "Ask a question between 1 and 500 characters." });
    return;
  }
  const { month, year } = parseBudgetSummaryPeriod(req.body ?? {});
  try {
    const forwardedProtocol = req.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    const summaryUrl = `${forwardedProtocol}://${req.get("host")}/api/ai/budget-summary?month=${month}&year=${year}`;
    const authorization = req.get("authorization");
    const workspaceId = req.get("x-jamvi-workspace");
    const summaryResponse = await fetch(summaryUrl, {
      headers: {
        cookie: req.headers.cookie ?? "",
        ...(authorization ? { authorization } : {}),
        ...(workspaceId ? { "x-jamvi-workspace": workspaceId } : {}),
      },
    });
    if (!summaryResponse.ok) {
      res.status(summaryResponse.status).json({ error: "Could not load the selected budget summary." });
      return;
    }
    const summary = await summaryResponse.json() as AskJamviSummary;
    const answer = await generateAskJamviResponse(question, summary);
    res.json({ answer, readOnly: true, workspaceScoped: true, month, year });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Ask Jamvi is temporarily unavailable." });
  }
});

export default router;
