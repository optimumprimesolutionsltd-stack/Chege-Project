import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  budgetCategoriesTable,
  expensesTable,
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

  const [group, budgetRows, expenseTotal, categoryRows, incomeRow, goals] = await Promise.all([
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
    guardrails: {
      readOnly: true,
      savingsAndEmergencyFundsAreGoals: true,
      workspaceScoped: true,
    },
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
    const summaryResponse = await fetch(summaryUrl, {
      headers: { cookie: req.headers.cookie ?? "" },
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
