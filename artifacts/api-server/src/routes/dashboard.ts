import { Router } from "express";
import { db } from "@workspace/db";
import {
  expensesTable,
  expenseCategoryAllocationsTable,
  expenseIncomeSplitsTable,
  budgetCategoriesTable,
  usersTable,
  jointAccountTxTable,
  jointAccountDepositSplitsTable,
  savingsGoalContributionsTable,
  savingsGoalsTable,
  groupMembershipsTable,
  groupsTable,
  incomeSourcesTable,
} from "@workspace/db";
import { sql, eq, and, inArray, isNull } from "drizzle-orm";
import {
  GetDashboardSummaryQueryParams,
  GetDashboardCategoryBreakdownQueryParams,
  GetDashboardCategoryLedgerQueryParams,
  GetDashboardActivityQueryParams,
  GetDashboardIncomeStreamsQueryParams,
  GetDashboardIncomeStreamsResponse,
  GetDashboardPeriodTotalsQueryParams,
  GetDashboardPeriodTotalsResponse,
  GetDashboardMonthlyReportPdfQueryParams,
} from "@workspace/api-zod";
import { getActiveGroupId } from "../lib/activeGroup";
import { createMonthlyReportPdf } from "../lib/monthly-report-pdf";

const router = Router();
const UNCATEGORIZED_CATEGORY = "Uncategorized";

function displayExpenseCategory(category: string) {
  return category.trim() === "" || category === UNCATEGORIZED_CATEGORY
    ? UNCATEGORIZED_CATEGORY
    : category;
}

function displayExpenseAllocations(
  category: string,
  amount: number,
  allocations?: Array<{ category: string; amount: number }>,
) {
  if (displayExpenseCategory(category) === UNCATEGORIZED_CATEGORY) return [];
  return allocations ?? [{ category, amount }];
}

function parseDateOnlyQuery(value: unknown): { raw: string; date: Date } | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;

  return { raw: value, date };
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const now = new Date();
  const parsed = GetDashboardSummaryQueryParams.safeParse(req.query);
  const month = parsed.success && parsed.data.month != null ? Math.round(parsed.data.month) : now.getMonth() + 1;
  const year = parsed.success && parsed.data.year != null ? Math.round(parsed.data.year) : now.getFullYear();

  // Sum budget_categories for the live total — never hardcoded
  const [budgetRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${budgetCategoriesTable.budgetAmount}), 0)` })
    .from(budgetCategoriesTable)
    .where(sql`${budgetCategoriesTable.groupId} = ${groupId} AND (${budgetCategoriesTable.isRecurring} = true OR (${budgetCategoriesTable.activeMonth} = ${month} AND ${budgetCategoriesTable.activeYear} = ${year}))`);
  const totalBudget = Number(budgetRow.total);

  const [spentRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${expensesTable.amount}), 0)` })
    .from(expensesTable)
    .where(sql`${expensesTable.groupId} = ${groupId} AND EXTRACT(MONTH FROM ${expensesTable.date}) = ${month} AND EXTRACT(YEAR FROM ${expensesTable.date}) = ${year}`);

  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(expensesTable)
    .where(sql`${expensesTable.groupId} = ${groupId} AND EXTRACT(MONTH FROM ${expensesTable.date}) = ${month} AND EXTRACT(YEAR FROM ${expensesTable.date}) = ${year}`);

  // Disbursements tagged to an expense category also count as spending
  const [categorisedDisbursementsRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${jointAccountTxTable.amount}), 0)` })
    .from(jointAccountTxTable)
    .where(sql`${jointAccountTxTable.groupId} = ${groupId} AND ${jointAccountTxTable.type} = 'disbursement' AND ${jointAccountTxTable.bankTransferId} IS NULL AND ${jointAccountTxTable.expenseCategory} IS NOT NULL AND ${jointAccountTxTable.expenseId} IS NULL AND EXTRACT(MONTH FROM ${jointAccountTxTable.date}) = ${month} AND EXTRACT(YEAR FROM ${jointAccountTxTable.date}) = ${year}`);

  // Contributions = expenses paid + bank deposits + savings goal contributions
  //
  // Expense contribution logic (split-aware):
  //   • If the expense has income splits → only the non-bank split amounts count
  //   • If no splits → full amount counts when paidFromBank = false
  //   • A joint-bank expense (paid_from_bank = true, paid_by_id IS NULL) has no
  //     individual contributor and must never enter a member's contribution total
  const [expenseContribs, depositContribs, savingsContribs] = await Promise.all([
    db.execute(sql`
      SELECT COALESCE(s.user_id, e.paid_by_id) AS "userId",
             COALESCE(SUM(CASE
               WHEN s.id IS NOT NULL AND s.from_bank = false THEN s.amount
               WHEN s.id IS NULL AND e.paid_from_bank = false THEN e.amount
               ELSE 0
             END), 0) AS total
      FROM expenses e
      LEFT JOIN expense_income_splits s ON s.expense_id = e.id
      WHERE e.group_id = ${groupId}
        AND EXTRACT(MONTH FROM e.date) = ${month}
        AND EXTRACT(YEAR FROM e.date) = ${year}
        AND NOT (e.paid_from_bank = true AND e.paid_by_id IS NULL)
      GROUP BY COALESCE(s.user_id, e.paid_by_id)
    `).then(r => (r.rows as { userId: string | null; total: string }[]).map(x => ({ userId: x.userId, total: Number(x.total) }))),

    db.execute(sql`
      SELECT COALESCE(s.user_id, t.made_by_id) AS "userId",
             COALESCE(SUM(CASE WHEN s.id IS NOT NULL THEN s.amount ELSE t.amount END), 0) AS total
      FROM joint_account_transactions t
      LEFT JOIN joint_account_deposit_splits s ON s.transaction_id = t.id
      WHERE t.group_id = ${groupId}
        AND t.type = 'deposit'
        AND t.bank_transfer_id IS NULL
        AND EXTRACT(MONTH FROM t.date) = ${month}
        AND EXTRACT(YEAR FROM t.date) = ${year}
      GROUP BY COALESCE(s.user_id, t.made_by_id)
    `).then(r => (r.rows as { userId: string | null; total: string }[]).map(x => ({ userId: x.userId, total: Number(x.total) }))),

    db.select({
      userId: savingsGoalContributionsTable.createdByUserId,
      total: sql<number>`COALESCE(SUM(${savingsGoalContributionsTable.amount}), 0)`,
    })
    .from(savingsGoalContributionsTable)
    .where(sql`${savingsGoalContributionsTable.groupId} = ${groupId} AND ${savingsGoalContributionsTable.createdByUserId} IS NOT NULL AND EXTRACT(MONTH FROM ${savingsGoalContributionsTable.createdAt}) = ${month} AND EXTRACT(YEAR FROM ${savingsGoalContributionsTable.createdAt}) = ${year}`)
    .groupBy(savingsGoalContributionsTable.createdByUserId),
  ]);

  const contribMap = new Map<string, number>();
  for (const r of [...expenseContribs, ...depositContribs, ...savingsContribs]) {
    const uid = (r as { userId: string | null }).userId;
    if (uid) contribMap.set(uid, (contribMap.get(uid) ?? 0) + Number(r.total));
  }
  const contribs = Array.from(contribMap.entries()).map(([userId, total]) => ({ userId, total }));

  // Per-person spending breakdown
  const memberExpenses = await db.execute(sql`
    SELECT COALESCE(s.user_id, e.paid_by_id) AS "userId",
           COALESCE(SUM(CASE
             WHEN s.id IS NOT NULL AND s.from_bank = false THEN s.amount
             WHEN s.id IS NULL AND e.paid_from_bank = false THEN e.amount
             ELSE 0
           END), 0) AS total
    FROM expenses e
    LEFT JOIN expense_income_splits s ON s.expense_id = e.id
    WHERE e.group_id = ${groupId}
      AND EXTRACT(MONTH FROM e.date) = ${month}
      AND EXTRACT(YEAR FROM e.date) = ${year}
        AND NOT (e.paid_from_bank = true AND e.paid_by_id IS NULL)
    GROUP BY COALESCE(s.user_id, e.paid_by_id)
  `).then(result => (result.rows as { userId: string | null; total: string }[]).map(row => ({
    userId: row.userId,
    total: Number(row.total),
  })));

  // Load all group members with their names and optional monthly targets
  const memberRows = await db
    .select({
      userId: groupMembershipsTable.userId,
      firstName: usersTable.firstName,
      monthlyTarget: groupMembershipsTable.monthlyTarget,
    })
    .from(groupMembershipsTable)
    .leftJoin(usersTable, eq(usersTable.id, groupMembershipsTable.userId))
    .where(eq(groupMembershipsTable.groupId, groupId));

  // Build fully dynamic memberContributions[] — no hardcoded names or targets
  const spentByMember = new Map(memberExpenses.filter(e => e.userId).map(e => [e.userId!, Number(e.total)]));
  const memberContributions = memberRows.map(m => {
    const contributed = contribMap.get(m.userId) ?? 0;
    const spent = spentByMember.get(m.userId) ?? 0;
    return {
      userId: m.userId,
      name: m.firstName ?? "Member",
      contributed,
      spent,
      net: contributed - spent,
      target: m.monthlyTarget ?? null,
    };
  });

  const totalSpent = Number(spentRow.total) + Number(categorisedDisbursementsRow.total);
  res.json({
    month, year,
    totalBudget,
    totalSpent,
    remaining: totalBudget - totalSpent,
    expenseCount: Number(countRow.count),
    memberContributions,
  });
});

// Per-member contribution breakdown (individual transactions)
router.get("/dashboard/member-breakdown", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const userId = (req.query.userId as string) ?? "";
  const now = new Date();
  const month = parseInt(req.query.month as string) || now.getMonth() + 1;
  const year  = parseInt(req.query.year  as string) || now.getFullYear();

  if (!userId) { res.status(400).json({ error: "userId required" }); return; }

  // Validate that the requested userId is a member of this group
  const [membership] = await db
    .select({ userId: groupMembershipsTable.userId })
    .from(groupMembershipsTable)
    .where(and(eq(groupMembershipsTable.groupId, groupId), eq(groupMembershipsTable.userId, userId)))
    .limit(1);
  if (!membership) { res.status(403).json({ error: "User is not a member of this group" }); return; }

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
    .where(sql`${expensesTable.groupId} = ${groupId}
           AND ${expensesTable.paidById} = ${userId}
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
    .where(sql`${jointAccountTxTable.groupId} = ${groupId}
           AND ${jointAccountTxTable.type} = 'deposit'
           AND ${jointAccountTxTable.bankTransferId} IS NULL
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
    .where(sql`${savingsGoalContributionsTable.groupId} = ${groupId}
           AND ${savingsGoalContributionsTable.createdByUserId} = ${userId}
           AND EXTRACT(MONTH FROM ${savingsGoalContributionsTable.createdAt}) = ${month}
           AND EXTRACT(YEAR  FROM ${savingsGoalContributionsTable.createdAt}) = ${year}`)
    .orderBy(sql`${savingsGoalContributionsTable.createdAt} DESC`),
  ]);

  const expenseTotal  = expenses.reduce((s, r) => s + Number(r.amount), 0);
  const depositTotal  = deposits.reduce((s, r) => s + Number(r.amount), 0);
  const savingsTotal  = savings.reduce((s,  r) => s + Number(r.amount), 0);

  res.json({
    expenses:  expenses.map(r => ({ ...r, category: displayExpenseCategory(r.category), amount: Number(r.amount), date: r.date ? String(r.date) : null })),
    deposits:  deposits.map(r => ({ ...r, amount: Number(r.amount), date: r.date ? String(r.date) : null })),
    savingsContributions: savings.map(r => ({ ...r, amount: Number(r.amount), date: r.date ? String(r.date) : null })),
    totals: { expenses: expenseTotal, deposits: depositTotal, savings: savingsTotal, grand: expenseTotal + depositTotal + savingsTotal },
  });
});

router.get("/dashboard/activity", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const now = new Date();
  const parsed = GetDashboardActivityQueryParams.safeParse(req.query);
  const month = parsed.success && parsed.data.month != null ? Math.round(parsed.data.month) : now.getMonth() + 1;
  const year = parsed.success && parsed.data.year != null ? Math.round(parsed.data.year) : now.getFullYear();
  const isMonthlyReport = parsed.success && (parsed.data.month != null || parsed.data.year != null);
  const monthlyLimit = isMonthlyReport ? 500 : 10;

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
    .where(isMonthlyReport
      ? sql`${expensesTable.groupId} = ${groupId} AND EXTRACT(MONTH FROM ${expensesTable.date}) = ${month} AND EXTRACT(YEAR FROM ${expensesTable.date}) = ${year}`
      : sql`${expensesTable.groupId} = ${groupId}`)
    .orderBy(sql`${expensesTable.createdAt} DESC`)
    .limit(monthlyLimit);
  const expenseAllocations = expenses.length === 0 ? [] : await db.select({
    expenseId: expenseCategoryAllocationsTable.expenseId,
    category: expenseCategoryAllocationsTable.category,
    amount: expenseCategoryAllocationsTable.amount,
    position: expenseCategoryAllocationsTable.position,
  }).from(expenseCategoryAllocationsTable).where(and(
    eq(expenseCategoryAllocationsTable.groupId, groupId),
    inArray(expenseCategoryAllocationsTable.expenseId, expenses.map((expense) => expense.id)),
  )).orderBy(expenseCategoryAllocationsTable.position);
  const allocationsByExpense = expenseAllocations.reduce((map, allocation) => {
    const portions = map.get(allocation.expenseId) ?? [];
    portions.push({ category: allocation.category, amount: allocation.amount });
    map.set(allocation.expenseId, portions);
    return map;
  }, new Map<number, Array<{ category: string; amount: number }>>());

  // Show recent deposits as contribution items in the activity feed
  const deposits = await db
    .select({
      id: jointAccountTxTable.id,
      amount: jointAccountTxTable.amount,
      description: jointAccountTxTable.description,
      madeById: jointAccountTxTable.madeById,
      madeByName: usersTable.firstName,
      date: jointAccountTxTable.date,
      createdAt: jointAccountTxTable.createdAt,
      savingsGoalId: jointAccountTxTable.savingsGoalId,
      bankTransferId: jointAccountTxTable.bankTransferId,
      hasContributorSplits: sql<boolean>`EXISTS (
        SELECT 1
        FROM ${jointAccountDepositSplitsTable}
        WHERE ${jointAccountDepositSplitsTable.transactionId} = ${jointAccountTxTable.id}
          AND ${jointAccountDepositSplitsTable.groupId} = ${groupId}
      )`,
    })
    .from(jointAccountTxTable)
    .leftJoin(usersTable, eq(jointAccountTxTable.madeById, usersTable.id))
    .where(isMonthlyReport
      ? sql`${jointAccountTxTable.groupId} = ${groupId} AND ${jointAccountTxTable.type} = 'deposit' AND ${jointAccountTxTable.bankTransferId} IS NULL AND EXTRACT(MONTH FROM ${jointAccountTxTable.date}) = ${month} AND EXTRACT(YEAR FROM ${jointAccountTxTable.date}) = ${year}`
      : and(eq(jointAccountTxTable.groupId, groupId), eq(jointAccountTxTable.type, "deposit"), isNull(jointAccountTxTable.bankTransferId)))
    .orderBy(sql`${jointAccountTxTable.createdAt} DESC`)
    .limit(monthlyLimit);

  // Include recent savings-goal contributions in the feed
  const savingsContribs = await db
    .select({
      id: savingsGoalContributionsTable.id,
      amount: savingsGoalContributionsTable.amount,
      goalName: savingsGoalsTable.name,
      createdByUserId: savingsGoalContributionsTable.createdByUserId,
      contributorName: usersTable.firstName,
      createdAt: savingsGoalContributionsTable.createdAt,
    })
    .from(savingsGoalContributionsTable)
    .leftJoin(savingsGoalsTable, eq(savingsGoalContributionsTable.goalId, savingsGoalsTable.id))
    .leftJoin(usersTable, eq(savingsGoalContributionsTable.createdByUserId, usersTable.id))
    .where(isMonthlyReport
      ? sql`${savingsGoalContributionsTable.groupId} = ${groupId} AND EXTRACT(MONTH FROM ${savingsGoalContributionsTable.createdAt}) = ${month} AND EXTRACT(YEAR FROM ${savingsGoalContributionsTable.createdAt}) = ${year}`
      : sql`${savingsGoalContributionsTable.groupId} = ${groupId}`)
    .orderBy(sql`${savingsGoalContributionsTable.createdAt} DESC`)
    .limit(monthlyLimit);

  // A monthly contribution report must use the same attribution units as the
  // summary above. A mixed expense or deposit therefore becomes one row per
  // funding portion instead of a misleading transaction-level total.
  let monthlyContributionItems: Array<{
    id: string;
    type: string;
    amount: number;
    description: string;
    userName: string;
    category: string | null;
    date: string;
  }> = [];

  if (isMonthlyReport) {
    const [expenseSplits, legacyExpenseRows, depositSplits, legacyDepositRows] = await Promise.all([
      db.select({
        id: expenseIncomeSplitsTable.id,
        expenseId: expensesTable.id,
        amount: expenseIncomeSplitsTable.amount,
        description: expensesTable.description,
        category: expensesTable.category,
        date: expensesTable.date,
        label: expenseIncomeSplitsTable.label,
        fromBank: expenseIncomeSplitsTable.fromBank,
        userName: usersTable.firstName,
      })
        .from(expenseIncomeSplitsTable)
        .innerJoin(expensesTable, eq(expenseIncomeSplitsTable.expenseId, expensesTable.id))
        .leftJoin(usersTable, eq(expenseIncomeSplitsTable.userId, usersTable.id))
        .where(sql`${expenseIncomeSplitsTable.groupId} = ${groupId} AND EXTRACT(MONTH FROM ${expensesTable.date}) = ${month} AND EXTRACT(YEAR FROM ${expensesTable.date}) = ${year}`),
      db.select({
        id: expensesTable.id,
        amount: expensesTable.amount,
        description: expensesTable.description,
        category: expensesTable.category,
        date: expensesTable.date,
        userName: usersTable.firstName,
      })
        .from(expensesTable)
        .leftJoin(usersTable, eq(expensesTable.paidById, usersTable.id))
        .where(sql`
          ${expensesTable.groupId} = ${groupId}
          AND ${expensesTable.paidFromBank} = false
          AND EXTRACT(MONTH FROM ${expensesTable.date}) = ${month}
          AND EXTRACT(YEAR FROM ${expensesTable.date}) = ${year}
          AND NOT EXISTS (
            SELECT 1 FROM expense_income_splits split
            WHERE split.expense_id = ${expensesTable.id}
              AND split.group_id = ${groupId}
          )
        `),
      db.select({
        id: jointAccountDepositSplitsTable.id,
        transactionId: jointAccountTxTable.id,
        amount: jointAccountDepositSplitsTable.amount,
        description: jointAccountTxTable.description,
        date: jointAccountTxTable.date,
        userName: usersTable.firstName,
      })
        .from(jointAccountDepositSplitsTable)
        .innerJoin(jointAccountTxTable, eq(jointAccountDepositSplitsTable.transactionId, jointAccountTxTable.id))
        .leftJoin(usersTable, eq(jointAccountDepositSplitsTable.userId, usersTable.id))
        .where(sql`
          ${jointAccountDepositSplitsTable.groupId} = ${groupId}
          AND ${jointAccountTxTable.type} = 'deposit'
          AND ${jointAccountTxTable.bankTransferId} IS NULL
          AND EXTRACT(MONTH FROM ${jointAccountTxTable.date}) = ${month}
          AND EXTRACT(YEAR FROM ${jointAccountTxTable.date}) = ${year}
        `),
      db.select({
        id: jointAccountTxTable.id,
        amount: jointAccountTxTable.amount,
        description: jointAccountTxTable.description,
        date: jointAccountTxTable.date,
        madeById: jointAccountTxTable.madeById,
        userName: usersTable.firstName,
      })
        .from(jointAccountTxTable)
        .leftJoin(usersTable, eq(jointAccountTxTable.madeById, usersTable.id))
        .where(sql`
          ${jointAccountTxTable.groupId} = ${groupId}
          AND ${jointAccountTxTable.type} = 'deposit'
          AND ${jointAccountTxTable.bankTransferId} IS NULL
          AND EXTRACT(MONTH FROM ${jointAccountTxTable.date}) = ${month}
          AND EXTRACT(YEAR FROM ${jointAccountTxTable.date}) = ${year}
          AND NOT EXISTS (
            SELECT 1 FROM joint_account_deposit_splits split
            WHERE split.transaction_id = ${jointAccountTxTable.id}
              AND split.group_id = ${groupId}
          )
        `),
    ]);

    monthlyContributionItems = [
      ...expenseSplits.map((split) => ({
        id: `expense-funding-${split.expenseId}-${split.id}`,
        editTarget: "expense" as const,
        type: split.fromBank ? "household" : "contribution",
        amount: Number(split.amount),
        description: `Expense paid: ${split.description}`,
        userName: split.fromBank ? "Joint bank" : (split.userName ?? split.label),
        category: displayExpenseCategory(split.category),
        date: String(split.date),
      })),
      ...legacyExpenseRows.map((expense) => ({
        id: `expense-funding-${expense.id}`,
        editTarget: "expense" as const,
        type: "contribution",
        amount: Number(expense.amount),
        description: `Expense paid: ${expense.description}`,
        userName: expense.userName ?? "Unknown",
        category: displayExpenseCategory(expense.category),
        date: String(expense.date),
      })),
      ...depositSplits.map((split) => ({
        id: `deposit-contributor-${split.transactionId}-${split.id}`,
        editTarget: "deposit" as const,
        type: "contribution",
        amount: Number(split.amount),
        description: `Bank deposit: ${split.description}`,
        userName: split.userName ?? "Unknown",
        category: null,
        date: String(split.date),
      })),
      ...legacyDepositRows.map((deposit) => ({
        id: `deposit-contributor-${deposit.id}`,
        editTarget: "deposit" as const,
        type: deposit.madeById === null ? "household" : "contribution",
        amount: Number(deposit.amount),
        description: `Bank deposit: ${deposit.description}`,
        userName: deposit.madeById === null ? "Joint bank" : (deposit.userName ?? "Unknown"),
        category: null,
        date: String(deposit.date),
      })),
      ...savingsContribs.map((saving) => ({
        id: `savings-${saving.id}`,
        type: saving.createdByUserId === null ? "household" : "contribution",
        amount: Number(saving.amount),
        description: `${saving.goalName ?? "Savings"} contribution`,
        userName: saving.createdByUserId === null ? "Joint bank" : (saving.contributorName ?? "Unknown"),
        category: null,
        date: saving.createdAt instanceof Date ? saving.createdAt.toISOString() : String(saving.createdAt),
      })),
    ];
  }

  const items = (isMonthlyReport ? monthlyContributionItems : [
    ...expenses.map((e) => ({
      id: `expense-${e.id}`,
      editTarget: "expense" as const,
      type: "expense",
      amount: e.amount,
      description: e.description,
      userName: e.paidById === null ? "Joint bank" : (e.paidByName ?? "Unknown"),
      category: displayExpenseCategory(e.category),
      categoryAllocations: displayExpenseAllocations(e.category, e.amount, allocationsByExpense.get(e.id)),
      // The feed's visible date must match the month used to include the expense.
      date: String(e.date),
    })),
    ...deposits.map((d) => ({
      id: `contribution-${d.id}`,
      // A savings-linked or split deposit must be corrected through its source
      // flow so individual funding history and goal balances stay consistent.
      ...(d.savingsGoalId === null && !d.hasContributorSplits
        ? { editTarget: "deposit" as const }
        : {}),
      type: "contribution",
      amount: d.amount,
      description: `Bank deposit: ${d.description}`,
      // null madeById = Joint bank (shared deposit with no individual attribution)
      userName: d.madeById === null ? "Joint bank" : (d.madeByName ?? "Unknown"),
      category: null,
      // Deposits are reported in the month of their banking transaction, not entry time.
      date: String(d.date),
    })),
    ...savingsContribs.map((s) => ({
      id: `savings-${s.id}`,
      type: "savings",
      amount: s.amount,
      description: `${s.goalName ?? "Savings"} contribution`,
      userName: s.createdByUserId === null ? "Joint bank" : (s.contributorName ?? "Unknown"),
      category: null,
      date: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt),
    })),
  ])
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, isMonthlyReport ? 500 : 20);

  res.json(items);
});

router.get("/dashboard/category-breakdown", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const now = new Date();
  const parsed = GetDashboardCategoryBreakdownQueryParams.safeParse(req.query);
  const month = parsed.success && parsed.data.month != null ? Math.round(parsed.data.month) : now.getMonth() + 1;
  const year = parsed.success && parsed.data.year != null ? Math.round(parsed.data.year) : now.getFullYear();

  const categories = await db
    .select()
    .from(budgetCategoriesTable)
    .where(sql`${budgetCategoriesTable.groupId} = ${groupId} AND (${budgetCategoriesTable.isRecurring} = true OR (${budgetCategoriesTable.activeMonth} = ${month} AND ${budgetCategoriesTable.activeYear} = ${year}))`)
    .orderBy(budgetCategoriesTable.priority);
  // Child allocations replace the legacy category only when they exist, so
  // historical rows remain visible without a data rewrite and totals remain
  // one expense amount per transaction.
  const spentByCategory = await db.execute(sql`
    SELECT category, COALESCE(SUM(amount), 0) AS total FROM (
      SELECT allocation.category, allocation.amount
      FROM expense_category_allocations allocation
      INNER JOIN expenses expense ON expense.id = allocation.expense_id AND expense.group_id = allocation.group_id
      WHERE allocation.group_id = ${groupId}
        AND EXTRACT(MONTH FROM expense.date) = ${month} AND EXTRACT(YEAR FROM expense.date) = ${year}
      UNION ALL
      SELECT expense.category, expense.amount
      FROM expenses expense
      WHERE expense.group_id = ${groupId}
        AND EXTRACT(MONTH FROM expense.date) = ${month} AND EXTRACT(YEAR FROM expense.date) = ${year}
        AND NOT EXISTS (SELECT 1 FROM expense_category_allocations allocation WHERE allocation.expense_id = expense.id AND allocation.group_id = ${groupId})
    ) allocated GROUP BY category
  `).then((result) => (result.rows as { category: string; total: string }[]).map((row) => ({ category: row.category, total: Number(row.total) })));

  // Also count disbursements that are tagged to an expense category
  const disbursementsByCategory = await db
    .select({
      category: jointAccountTxTable.expenseCategory,
      total: sql<number>`COALESCE(SUM(${jointAccountTxTable.amount}), 0)`,
    })
    .from(jointAccountTxTable)
    .where(sql`${jointAccountTxTable.groupId} = ${groupId} AND ${jointAccountTxTable.type} = 'disbursement' AND ${jointAccountTxTable.bankTransferId} IS NULL AND ${jointAccountTxTable.expenseCategory} IS NOT NULL AND ${jointAccountTxTable.expenseId} IS NULL AND EXTRACT(MONTH FROM ${jointAccountTxTable.date}) = ${month} AND EXTRACT(YEAR FROM ${jointAccountTxTable.date}) = ${year}`)
    .groupBy(jointAccountTxTable.expenseCategory);

  const spentMap = new Map(spentByCategory.map((s) => [s.category, s.total]));
  const disbursementMap = new Map(disbursementsByCategory.map((d) => [d.category, Number(d.total)]));

  const breakdown = categories.map((cat) => {
    // The storage sentinel is never a budget category, even if a legacy
    // budget row happens to have the same name.
    const spentAmount = cat.name === UNCATEGORIZED_CATEGORY
      ? 0
      : (spentMap.get(cat.name) ?? 0) + (disbursementMap.get(cat.name) ?? 0);
    return {
      category: cat.name,
      budgetAmount: cat.budgetAmount,
      spentAmount,
      remaining: cat.budgetAmount - spentAmount,
      percentUsed: Math.round(cat.budgetAmount > 0 ? (spentAmount / cat.budgetAmount) * 100 * 10 : 0) / 10,
      priority: cat.priority,
      color: cat.color,
      isRecurring: cat.isRecurring,
      activeMonth: cat.activeMonth,
      activeYear: cat.activeYear,
      isBudgeted: true,
    };
  });

  const totalActual =
    Array.from(spentMap.values()).reduce((sum, spent) => sum + spent, 0) +
    Array.from(disbursementMap.values()).reduce((sum, spent) => sum + spent, 0);
  const budgetedActual = breakdown.reduce((sum, category) => sum + category.spentAmount, 0);
  const unbudgetedSpent = Math.max(0, totalActual - budgetedActual);

  if (unbudgetedSpent > 0) {
    breakdown.push({
      category: "Unbudgeted spending",
      budgetAmount: 0,
      spentAmount: unbudgetedSpent,
      remaining: -unbudgetedSpent,
      percentUsed: 100,
      priority: 999,
      color: "#F59E0B",
      isRecurring: true,
      activeMonth: null,
      activeYear: null,
      isBudgeted: false,
    });
  }

  res.json(breakdown);
});

router.get("/dashboard/category-ledger", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const parsed = GetDashboardCategoryLedgerQueryParams.safeParse(req.query);
  const rawIsBudgeted = req.query.isBudgeted;
  if (!parsed.success || (rawIsBudgeted !== "true" && rawIsBudgeted !== "false")) {
    res.status(400).json({ error: "A category and budget status are required." });
    return;
  }

  const now = new Date();
  const month = parsed.data.month ?? now.getMonth() + 1;
  const year = parsed.data.year ?? now.getFullYear();
  const { category } = parsed.data;
  const isBudgeted = rawIsBudgeted === "true";

  const [activeCategories, expenses, disbursements, allocations] = await Promise.all([
    db
      .select({ name: budgetCategoriesTable.name })
      .from(budgetCategoriesTable)
      .where(sql`${budgetCategoriesTable.groupId} = ${groupId} AND (${budgetCategoriesTable.isRecurring} = true OR (${budgetCategoriesTable.activeMonth} = ${month} AND ${budgetCategoriesTable.activeYear} = ${year}))`),
    db
      .select({
        id: expensesTable.id,
        category: expensesTable.category,
        description: expensesTable.description,
        amount: expensesTable.amount,
        paidFromBank: expensesTable.paidFromBank,
        payerName: usersTable.firstName,
        date: expensesTable.date,
      })
      .from(expensesTable)
      .leftJoin(usersTable, eq(expensesTable.paidById, usersTable.id))
      .where(sql`${expensesTable.groupId} = ${groupId} AND EXTRACT(MONTH FROM ${expensesTable.date}) = ${month} AND EXTRACT(YEAR FROM ${expensesTable.date}) = ${year}`),
    db
      .select({
        id: jointAccountTxTable.id,
        category: jointAccountTxTable.expenseCategory,
        description: jointAccountTxTable.description,
        amount: jointAccountTxTable.amount,
        payerName: usersTable.firstName,
        date: jointAccountTxTable.date,
      })
      .from(jointAccountTxTable)
      .leftJoin(usersTable, eq(jointAccountTxTable.madeById, usersTable.id))
      .where(sql`${jointAccountTxTable.groupId} = ${groupId} AND ${jointAccountTxTable.type} = 'disbursement' AND ${jointAccountTxTable.bankTransferId} IS NULL AND ${jointAccountTxTable.expenseCategory} IS NOT NULL AND ${jointAccountTxTable.expenseId} IS NULL AND EXTRACT(MONTH FROM ${jointAccountTxTable.date}) = ${month} AND EXTRACT(YEAR FROM ${jointAccountTxTable.date}) = ${year}`),
    db.select({
      expenseId: expenseCategoryAllocationsTable.expenseId,
      category: expenseCategoryAllocationsTable.category,
      amount: expenseCategoryAllocationsTable.amount,
      position: expenseCategoryAllocationsTable.position,
    }).from(expenseCategoryAllocationsTable)
      .innerJoin(expensesTable, and(
        eq(expenseCategoryAllocationsTable.expenseId, expensesTable.id),
        eq(expenseCategoryAllocationsTable.groupId, expensesTable.groupId),
      ))
      .where(sql`${expenseCategoryAllocationsTable.groupId} = ${groupId} AND EXTRACT(MONTH FROM ${expensesTable.date}) = ${month} AND EXTRACT(YEAR FROM ${expensesTable.date}) = ${year}`)
      .orderBy(expenseCategoryAllocationsTable.position),
  ]);

  const activeCategoryNames = new Set(activeCategories
    .map((item) => item.name)
    .filter((name) => name !== UNCATEGORIZED_CATEGORY));
  const isIncluded = (entryCategory: string) => (
    isBudgeted
      ? entryCategory !== UNCATEGORIZED_CATEGORY && entryCategory === category
      : !activeCategoryNames.has(entryCategory)
  );
  const entries = [
    ...expenses.flatMap((expense) => {
      const expenseAllocations = allocations.filter((allocation) => allocation.expenseId === expense.id);
      const portions = expenseAllocations.length > 0 ? expenseAllocations : [{ category: expense.category, amount: expense.amount }];
      return portions.filter((portion) => isIncluded(portion.category)).map((portion) => ({
        id: `expense-${expense.id}-${portion.category}`,
        source: "expense" as const,
        category: displayExpenseCategory(portion.category),
        description: expense.description,
        amount: portion.amount,
        payerName: expense.payerName ?? (expense.paidFromBank ? "Joint bank" : "Payer not recorded"),
        date: String(expense.date),
      }));
    }),
    ...disbursements
      .filter((disbursement) => isIncluded(disbursement.category ?? ""))
      .map((disbursement) => ({
        id: `bank-disbursement-${disbursement.id}`,
        source: "bank_disbursement" as const,
        category: disbursement.category ?? "Uncategorized",
        description: disbursement.description,
        amount: disbursement.amount,
        payerName: disbursement.payerName ?? "Joint bank",
        date: String(disbursement.date),
      })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  res.json({
    category,
    total: entries.reduce((sum, entry) => sum + entry.amount, 0),
    entries,
  });
});

/**
 * Funding is attributed at the same unit as the contribution summary:
 * personal expense portions, bank deposits, and personal savings additions.
 * Joint-bank expense portions are intentionally absent so a prior deposit is
 * never reported a second time as another income contribution.
 */
router.get("/dashboard/income-streams", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const now = new Date();
  const parsed = GetDashboardIncomeStreamsQueryParams.safeParse(req.query);
  const month = parsed.success && parsed.data.month != null ? Math.round(parsed.data.month) : now.getMonth() + 1;
  const year = parsed.success && parsed.data.year != null ? Math.round(parsed.data.year) : now.getFullYear();

  const result = await db.execute(sql`
    WITH funding AS (
      -- Explicit personal portions of split-funded expenses.
      SELECT split.income_source_id, split.amount, 'expense'::text AS record_type, expense.id AS record_id,
             expense.description, expense.date::text AS date
      FROM expense_income_splits split
      INNER JOIN expenses expense ON expense.id = split.expense_id AND expense.group_id = ${groupId}
      WHERE split.group_id = ${groupId}
        AND split.from_bank = false
        AND EXTRACT(MONTH FROM expense.date) = ${month}
        AND EXTRACT(YEAR FROM expense.date) = ${year}

      UNION ALL

      -- Legacy/direct personal expenses, only when no explicit portions exist.
      SELECT expense.income_source_id, expense.amount, 'expense'::text AS record_type, expense.id AS record_id,
             expense.description, expense.date::text AS date
      FROM expenses expense
      WHERE expense.group_id = ${groupId}
        AND expense.paid_from_bank = false
        AND EXTRACT(MONTH FROM expense.date) = ${month}
        AND EXTRACT(YEAR FROM expense.date) = ${year}
        AND NOT EXISTS (
          SELECT 1
          FROM expense_income_splits split
          WHERE split.expense_id = expense.id
            AND split.group_id = ${groupId}
        )

      UNION ALL

      -- Explicit contributor portions of shared-bank deposits.
      SELECT split.income_source_id, split.amount, 'deposit'::text AS record_type, deposit.id AS record_id,
             deposit.description, deposit.date::text AS date
      FROM joint_account_deposit_splits split
      INNER JOIN joint_account_transactions deposit
        ON deposit.id = split.transaction_id AND deposit.group_id = ${groupId}
      WHERE split.group_id = ${groupId}
        AND deposit.type = 'deposit'
          AND deposit.bank_transfer_id IS NULL
        AND deposit.transfer_direction IS DISTINCT FROM 'from_savings'
        AND EXTRACT(MONTH FROM deposit.date) = ${month}
        AND EXTRACT(YEAR FROM deposit.date) = ${year}

      UNION ALL

      -- Legacy/direct shared-bank deposits, only when no explicit portions exist.
      SELECT deposit.income_source_id, deposit.amount, 'deposit'::text AS record_type, deposit.id AS record_id,
             deposit.description, deposit.date::text AS date
      FROM joint_account_transactions deposit
      WHERE deposit.group_id = ${groupId}
        AND deposit.type = 'deposit'
        AND deposit.bank_transfer_id IS NULL
        AND deposit.transfer_direction IS DISTINCT FROM 'from_savings'
        AND EXTRACT(MONTH FROM deposit.date) = ${month}
        AND EXTRACT(YEAR FROM deposit.date) = ${year}
        AND NOT EXISTS (
          SELECT 1
          FROM joint_account_deposit_splits split
          WHERE split.transaction_id = deposit.id
            AND split.group_id = ${groupId}
        )

      UNION ALL

      -- Savings additions follow the existing personal-contribution rule.
      -- Savings rows do not have an income-source field, so they remain
      -- explicitly Unattributed instead of being guessed from the member.
      SELECT NULL::integer AS income_source_id, contribution.amount,
             'savings'::text AS record_type, contribution.id AS record_id,
             CONCAT('Savings: ', COALESCE(goal.name, 'Savings goal')) AS description,
             contribution.created_at::text AS date
      FROM savings_goal_contributions contribution
      LEFT JOIN savings_goals goal
        ON goal.id = contribution.goal_id AND goal.group_id = ${groupId}
      WHERE contribution.group_id = ${groupId}
        AND contribution.created_by_user_id IS NOT NULL
        AND contribution.is_balance_correction = false
        AND contribution.note IS NULL
        AND EXTRACT(MONTH FROM contribution.created_at) = ${month}
        AND EXTRACT(YEAR FROM contribution.created_at) = ${year}
    )
    SELECT
      CASE WHEN source.id IS NULL THEN NULL ELSE funding.income_source_id END AS "incomeSourceId",
      CASE WHEN source.id IS NULL THEN 'Unattributed' ELSE source.name END AS "sourceName",
      CASE WHEN source.id IS NULL THEN NULL ELSE source.user_id END AS "ownerId",
      CASE
        WHEN source.id IS NULL THEN 'No income stream selected'
        ELSE COALESCE(owner.preferred_name, owner.first_name, 'Member')
      END AS "ownerName",
      COALESCE(SUM(funding.amount), 0) AS total,
      COUNT(DISTINCT funding.record_type || ':' || funding.record_id::text) AS "transactionCount",
      JSON_AGG(JSON_BUILD_OBJECT(
        'recordType', funding.record_type,
        'recordId', funding.record_id,
        'amount', funding.amount,
        'description', funding.description,
        'date', funding.date
      ) ORDER BY funding.date DESC, funding.record_type ASC, funding.record_id DESC) AS entries
    FROM funding
    LEFT JOIN income_sources source
      ON source.id = funding.income_source_id
      AND source.group_id = ${groupId}
    LEFT JOIN users owner ON owner.id = source.user_id
    GROUP BY
      CASE WHEN source.id IS NULL THEN NULL ELSE funding.income_source_id END,
      CASE WHEN source.id IS NULL THEN 'Unattributed' ELSE source.name END,
      CASE WHEN source.id IS NULL THEN NULL ELSE source.user_id END,
      CASE
        WHEN source.id IS NULL THEN 'No income stream selected'
        ELSE COALESCE(owner.preferred_name, owner.first_name, 'Member')
      END
    ORDER BY total DESC, "sourceName" ASC
  `);

  const rawRows = result.rows as Array<{
    incomeSourceId: number | null;
    sourceName: string;
    ownerId: string | null;
    ownerName: string;
    total: string | number;
    transactionCount: string | number;
    entries?: unknown;
  }>;
  type FundingEntry = {
    recordType: "expense" | "deposit" | "savings";
    recordId: number;
    amount: number;
    description: string;
    date: string;
  };
  const parseEntries = (rawEntries: unknown): FundingEntry[] => {
    let entries: unknown[] = [];
    if (Array.isArray(rawEntries)) {
      entries = rawEntries;
    } else if (typeof rawEntries === "string") {
      try {
        const parsedEntries: unknown = JSON.parse(rawEntries);
        entries = Array.isArray(parsedEntries) ? parsedEntries : [];
      } catch {
        entries = [];
      }
    }
    return entries.flatMap((entry): FundingEntry[] => {
      if (entry === null || typeof entry !== "object") return [];
      const value = entry as Record<string, unknown>;
      const recordType = value.recordType;
      const recordId = Number(value.recordId);
      const amount = Number(value.amount);
      if (
        (recordType !== "expense" && recordType !== "deposit" && recordType !== "savings")
        || !Number.isInteger(recordId)
        || !Number.isFinite(amount)
        || typeof value.description !== "string"
        || typeof value.date !== "string"
      ) {
        return [];
      }
      return [{
        recordType,
        recordId,
        amount,
        description: value.description,
        date: value.date,
      }];
    });
  };
  const sources = await db
    .select({
      id: incomeSourcesTable.id,
      name: incomeSourcesTable.name,
      userId: incomeSourcesTable.userId,
      expectedMonthlyAmount: incomeSourcesTable.expectedMonthlyAmount,
      ownerName: usersTable.firstName,
    })
    .from(incomeSourcesTable)
    .leftJoin(usersTable, eq(usersTable.id, incomeSourcesTable.userId))
    .where(eq(incomeSourcesTable.groupId, groupId));
  const actualBySource = new Map(rawRows
    .filter((row): row is typeof row & { incomeSourceId: number } => row.incomeSourceId !== null)
    .map((row) => [row.incomeSourceId, row]));
  const totalFunding = rawRows.reduce((sum, row) => sum + Number(row.total), 0);
  const totalExpected = sources.reduce((sum, source) => sum + source.expectedMonthlyAmount, 0);
  const streams: Array<{
    incomeSourceId: number | null;
    sourceName: string;
    ownerId: string | null;
    ownerName: string;
    total: number;
    expectedMonthlyAmount: number;
    remainingBalance: number;
    variance: number;
    sharePercent: number;
    transactionCount: number;
    entries: FundingEntry[];
  }> = sources.map((source) => {
    const actual = actualBySource.get(source.id);
    const total = actual ? Number(actual.total) : 0;
    return {
      incomeSourceId: source.id,
      sourceName: source.name,
      ownerId: source.userId,
      ownerName: source.ownerName ?? "Member",
      total,
      expectedMonthlyAmount: source.expectedMonthlyAmount,
      remainingBalance: source.expectedMonthlyAmount - total,
      variance: total - source.expectedMonthlyAmount,
      sharePercent: totalFunding > 0 ? Math.round((total / totalFunding) * 1000) / 10 : 0,
      transactionCount: actual ? Number(actual.transactionCount) : 0,
      entries: actual ? parseEntries(actual.entries) : [],
    };
  });
  const unattributed = rawRows.find((row) => row.incomeSourceId === null);
  if (unattributed) {
    const total = Number(unattributed.total);
    streams.push({
      incomeSourceId: null,
      sourceName: unattributed.sourceName,
      ownerId: null,
      ownerName: unattributed.ownerName,
      total,
      expectedMonthlyAmount: 0,
      remainingBalance: -total,
      variance: total,
      sharePercent: totalFunding > 0 ? Math.round((total / totalFunding) * 1000) / 10 : 0,
      transactionCount: Number(unattributed.transactionCount),
      entries: parseEntries(unattributed.entries),
    });
  }
  const response = {
    month,
    year,
    totalFunding,
    totalExpected,
    remainingBalance: totalExpected - totalFunding,
    streams,
  };

  res.json(GetDashboardIncomeStreamsResponse.parse(response));
});

router.get("/dashboard/period-totals", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const start = parseDateOnlyQuery(req.query.startDate);
  const end = parseDateOnlyQuery(req.query.endDate);
  const parsed = GetDashboardPeriodTotalsQueryParams.safeParse({
    startDate: start?.date,
    endDate: end?.date,
  });

  if (!start || !end || !parsed.success) {
    res.status(400).json({ error: "Choose a valid start and end date." });
    return;
  }

  if (start.raw > end.raw) {
    res.status(400).json({ error: "The start date must be on or before the end date." });
    return;
  }

  const result = await db.execute(sql`
    WITH expense_rows AS (
      SELECT
        expense.id,
        expense.amount,
        expense.paid_from_bank,
        COUNT(split.id) AS split_count,
        COALESCE(SUM(CASE WHEN split.from_bank = false THEN split.amount ELSE 0 END), 0) AS personal_funding
      FROM expenses expense
      LEFT JOIN expense_income_splits split
        ON split.expense_id = expense.id
        AND split.group_id = ${groupId}
      WHERE expense.group_id = ${groupId}
        AND expense.date >= ${start.raw}::date
        AND expense.date <= ${end.raw}::date
      GROUP BY expense.id, expense.amount, expense.paid_from_bank
    ),
    expense_totals AS (
      SELECT
        COALESCE(SUM(amount), 0) AS expense_total,
        COUNT(*) AS expense_count,
        COALESCE(SUM(CASE
          WHEN split_count > 0 THEN personal_funding
          WHEN paid_from_bank = false THEN amount
          ELSE 0
        END), 0) AS personal_funding_total
      FROM expense_rows
    ),
    bank_totals AS (
      SELECT
        COALESCE(SUM(CASE
          WHEN bank_tx.type = 'deposit'
            AND bank_tx.bank_transfer_id IS NULL
            AND bank_tx.transfer_direction IS DISTINCT FROM 'from_savings'
          THEN bank_tx.amount
          ELSE 0
        END), 0) AS bank_deposit_total,
        COUNT(*) FILTER (
          WHERE bank_tx.type = 'deposit'
            AND bank_tx.bank_transfer_id IS NULL
            AND bank_tx.transfer_direction IS DISTINCT FROM 'from_savings'
        ) AS bank_deposit_count,
        COALESCE(SUM(CASE
          WHEN bank_tx.type = 'disbursement'
            AND bank_tx.bank_transfer_id IS NULL
            AND bank_tx.bank_charge = false THEN bank_tx.amount
          ELSE 0
        END), 0) AS bank_disbursement_total,
        COUNT(*) FILTER (
          WHERE bank_tx.type = 'disbursement'
            AND bank_tx.bank_transfer_id IS NULL
            AND bank_tx.bank_charge = false
        ) AS bank_disbursement_count,
        COALESCE(SUM(CASE
          WHEN bank_tx.type = 'disbursement'
            AND bank_tx.bank_transfer_id IS NULL
            AND bank_tx.expense_id IS NULL
            AND bank_tx.expense_category IS NOT NULL
          THEN bank_tx.amount
          ELSE 0
        END), 0) AS standalone_disbursement_total
      FROM joint_account_transactions bank_tx
      WHERE bank_tx.group_id = ${groupId}
        AND bank_tx.date >= ${start.raw}::date
        AND bank_tx.date <= ${end.raw}::date
    ),
    savings_totals AS (
      SELECT
        COALESCE(SUM(contribution.amount), 0) AS savings_total,
        COUNT(*) AS savings_count
      FROM savings_goal_contributions contribution
      WHERE contribution.group_id = ${groupId}
        AND contribution.created_by_user_id IS NOT NULL
        AND contribution.is_balance_correction = false
        AND contribution.note IS NULL
        AND contribution.created_at >= ${start.raw}::date
        AND contribution.created_at < (${end.raw}::date + INTERVAL '1 day')
    )
    SELECT
      expense_totals.expense_total AS "expenseTotal",
      expense_totals.expense_count AS "expenseCount",
      bank_totals.bank_deposit_total AS "bankDepositTotal",
      bank_totals.bank_deposit_count AS "bankDepositCount",
      bank_totals.bank_disbursement_total AS "bankDisbursementTotal",
      bank_totals.bank_disbursement_count AS "bankDisbursementCount",
      savings_totals.savings_total AS "savingsTotal",
      savings_totals.savings_count AS "savingsCount",
      expense_totals.expense_total + bank_totals.standalone_disbursement_total AS "spendingTotal",
      expense_totals.personal_funding_total
        + bank_totals.bank_deposit_total
        + savings_totals.savings_total AS "contributionTotal"
    FROM expense_totals
    CROSS JOIN bank_totals
    CROSS JOIN savings_totals
  `);

  const row = (result.rows[0] ?? {}) as Record<string, string | number | null>;
  const numberValue = (key: string) => Number(row[key] ?? 0);
  const spendingTotal = numberValue("spendingTotal");
  const contributionTotal = numberValue("contributionTotal");
  const response = {
    startDate: start.raw,
    endDate: end.raw,
    expenseTotal: numberValue("expenseTotal"),
    spendingTotal,
    contributionTotal,
    bankDepositTotal: numberValue("bankDepositTotal"),
    bankDisbursementTotal: numberValue("bankDisbursementTotal"),
    savingsTotal: numberValue("savingsTotal"),
    netMovement: contributionTotal - spendingTotal,
    expenseCount: numberValue("expenseCount"),
    bankDepositCount: numberValue("bankDepositCount"),
    bankDisbursementCount: numberValue("bankDisbursementCount"),
    savingsCount: numberValue("savingsCount"),
  };

  GetDashboardPeriodTotalsResponse.parse({
    ...response,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
  });
  res.json(response);
});

router.get("/dashboard/monthly-report.pdf", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const now = new Date();
  const parsed = GetDashboardMonthlyReportPdfQueryParams.safeParse(req.query);
  const month = parsed.success && parsed.data.month != null ? Math.round(parsed.data.month) : now.getMonth() + 1;
  const year = parsed.success && parsed.data.year != null ? Math.round(parsed.data.year) : now.getFullYear();
  const [group] = await db
    .select({ name: groupsTable.name })
    .from(groupsTable)
    .where(eq(groupsTable.id, groupId))
    .limit(1);

  const [categories, spentByCategory, disbursementsByCategory, expenseTotal, incomeResult] = await Promise.all([
    db
      .select()
      .from(budgetCategoriesTable)
      .where(sql`${budgetCategoriesTable.groupId} = ${groupId} AND (${budgetCategoriesTable.isRecurring} = true OR (${budgetCategoriesTable.activeMonth} = ${month} AND ${budgetCategoriesTable.activeYear} = ${year}))`)
      .orderBy(budgetCategoriesTable.priority),
    db.execute(sql`
      SELECT category, COALESCE(SUM(amount), 0) AS total FROM (
        SELECT allocation.category, allocation.amount
        FROM expense_category_allocations allocation
        INNER JOIN expenses expense ON expense.id = allocation.expense_id AND expense.group_id = allocation.group_id
        WHERE allocation.group_id = ${groupId}
          AND EXTRACT(MONTH FROM expense.date) = ${month} AND EXTRACT(YEAR FROM expense.date) = ${year}
        UNION ALL
        SELECT expense.category, expense.amount
        FROM expenses expense
        WHERE expense.group_id = ${groupId}
          AND EXTRACT(MONTH FROM expense.date) = ${month} AND EXTRACT(YEAR FROM expense.date) = ${year}
          AND NOT EXISTS (SELECT 1 FROM expense_category_allocations allocation WHERE allocation.expense_id = expense.id AND allocation.group_id = ${groupId})
      ) allocated GROUP BY category
    `).then((result) => (result.rows as { category: string; total: string }[]).map((row) => ({ category: row.category, total: Number(row.total) }))),
    db
      .select({ category: jointAccountTxTable.expenseCategory, total: sql<number>`COALESCE(SUM(${jointAccountTxTable.amount}), 0)` })
      .from(jointAccountTxTable)
      .where(sql`${jointAccountTxTable.groupId} = ${groupId} AND ${jointAccountTxTable.type} = 'disbursement' AND ${jointAccountTxTable.bankTransferId} IS NULL AND ${jointAccountTxTable.expenseCategory} IS NOT NULL AND ${jointAccountTxTable.expenseId} IS NULL AND EXTRACT(MONTH FROM ${jointAccountTxTable.date}) = ${month} AND EXTRACT(YEAR FROM ${jointAccountTxTable.date}) = ${year}`)
      .groupBy(jointAccountTxTable.expenseCategory),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(expensesTable)
      .where(sql`${expensesTable.groupId} = ${groupId} AND EXTRACT(MONTH FROM ${expensesTable.date}) = ${month} AND EXTRACT(YEAR FROM ${expensesTable.date}) = ${year}`),
    db.execute(sql`
      WITH funding AS (
        SELECT split.income_source_id, split.amount, 'expense'::text AS record_type, expense.id AS record_id
        FROM expense_income_splits split
        INNER JOIN expenses expense ON expense.id = split.expense_id AND expense.group_id = ${groupId}
        WHERE split.group_id = ${groupId} AND split.from_bank = false
          AND EXTRACT(MONTH FROM expense.date) = ${month} AND EXTRACT(YEAR FROM expense.date) = ${year}
        UNION ALL
        SELECT expense.income_source_id, expense.amount, 'expense'::text, expense.id
        FROM expenses expense
        WHERE expense.group_id = ${groupId} AND expense.paid_from_bank = false
          AND EXTRACT(MONTH FROM expense.date) = ${month} AND EXTRACT(YEAR FROM expense.date) = ${year}
          AND NOT EXISTS (SELECT 1 FROM expense_income_splits split WHERE split.expense_id = expense.id AND split.group_id = ${groupId})
        UNION ALL
        SELECT split.income_source_id, split.amount, 'deposit'::text, deposit.id
        FROM joint_account_deposit_splits split
        INNER JOIN joint_account_transactions deposit ON deposit.id = split.transaction_id AND deposit.group_id = ${groupId}
        WHERE split.group_id = ${groupId} AND deposit.type = 'deposit'
          AND deposit.bank_transfer_id IS NULL
          AND deposit.transfer_direction IS DISTINCT FROM 'from_savings'
          AND EXTRACT(MONTH FROM deposit.date) = ${month} AND EXTRACT(YEAR FROM deposit.date) = ${year}
        UNION ALL
        SELECT deposit.income_source_id, deposit.amount, 'deposit'::text, deposit.id
        FROM joint_account_transactions deposit
        WHERE deposit.group_id = ${groupId} AND deposit.type = 'deposit'
          AND deposit.bank_transfer_id IS NULL
          AND deposit.transfer_direction IS DISTINCT FROM 'from_savings'
          AND EXTRACT(MONTH FROM deposit.date) = ${month} AND EXTRACT(YEAR FROM deposit.date) = ${year}
          AND NOT EXISTS (SELECT 1 FROM joint_account_deposit_splits split WHERE split.transaction_id = deposit.id AND split.group_id = ${groupId})
        UNION ALL
        SELECT NULL::integer, contribution.amount, 'savings'::text, contribution.id
        FROM savings_goal_contributions contribution
        WHERE contribution.group_id = ${groupId} AND contribution.created_by_user_id IS NOT NULL
          AND contribution.is_balance_correction = false
          AND contribution.note IS NULL
          AND EXTRACT(MONTH FROM contribution.created_at) = ${month} AND EXTRACT(YEAR FROM contribution.created_at) = ${year}
      )
      SELECT
        CASE WHEN source.id IS NULL THEN 'Unattributed' ELSE source.name END AS "sourceName",
        CASE WHEN source.id IS NULL THEN 'No income stream selected' ELSE COALESCE(owner.preferred_name, owner.first_name, 'Member') END AS "ownerName",
        COALESCE(SUM(funding.amount), 0) AS total,
        COUNT(DISTINCT funding.record_type || ':' || funding.record_id::text) AS "transactionCount"
      FROM funding
      LEFT JOIN income_sources source ON source.id = funding.income_source_id AND source.group_id = ${groupId}
      LEFT JOIN users owner ON owner.id = source.user_id
      GROUP BY
        CASE WHEN source.id IS NULL THEN 'Unattributed' ELSE source.name END,
        CASE WHEN source.id IS NULL THEN 'No income stream selected' ELSE COALESCE(owner.preferred_name, owner.first_name, 'Member') END
      ORDER BY total DESC, "sourceName" ASC
    `),
  ]);

  const spentMap = new Map(spentByCategory.map((item) => [item.category, item.total]));
  const disbursementMap = new Map(disbursementsByCategory.map((item) => [item.category, Number(item.total)]));
  const categoryRows = categories.map((category) => {
    const spentAmount = category.name === UNCATEGORIZED_CATEGORY
      ? 0
      : (spentMap.get(category.name) ?? 0) + (disbursementMap.get(category.name) ?? 0);
    return {
      category: category.name,
      budgetAmount: category.budgetAmount,
      spentAmount,
      remaining: category.budgetAmount - spentAmount,
      percentUsed: Math.round(category.budgetAmount > 0 ? (spentAmount / category.budgetAmount) * 1000 : 0) / 10,
    };
  });
  const totalActual =
    Array.from(spentMap.values()).reduce((sum, amount) => sum + amount, 0) +
    Array.from(disbursementMap.values()).reduce((sum, amount) => sum + amount, 0);
  const budgetedActual = categoryRows.reduce((sum, category) => sum + category.spentAmount, 0);
  const unbudgetedSpent = Math.max(0, totalActual - budgetedActual);
  if (unbudgetedSpent > 0) {
    categoryRows.push({
      category: "Unbudgeted spending",
      budgetAmount: 0,
      spentAmount: unbudgetedSpent,
      remaining: -unbudgetedSpent,
      percentUsed: 100,
    });
  }

  const rawIncomeRows = incomeResult.rows as Array<{
    sourceName: string;
    ownerName: string;
    total: string | number;
    transactionCount: string | number;
  }>;
  const totalFunding = rawIncomeRows.reduce((sum, row) => sum + Number(row.total), 0);
  const monthLabel = new Intl.DateTimeFormat("en-KE", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
  const totalBudget = categoryRows.reduce((sum, category) => sum + category.budgetAmount, 0);
  const pdf = await createMonthlyReportPdf({
    groupName: group?.name ?? "Shared group",
    monthLabel,
    totalBudget,
    totalSpent: totalActual,
    remaining: totalBudget - totalActual,
    expenseCount: Number(expenseTotal[0]?.count ?? 0),
    categories: categoryRows,
    totalFunding,
    incomeStreams: rawIncomeRows.map((row) => ({
      sourceName: row.sourceName,
      ownerName: row.ownerName,
      total: Number(row.total),
      sharePercent: totalFunding > 0 ? Math.round((Number(row.total) / totalFunding) * 1000) / 10 : 0,
      transactionCount: Number(row.transactionCount),
    })),
  });

  const filename = `jamvi-monthly-report-${year}-${String(month).padStart(2, "0")}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(pdf);
});

router.get("/dashboard/trends", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

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
      .where(sql`${expensesTable.groupId} = ${groupId} AND EXTRACT(MONTH FROM ${expensesTable.date}) = ${m} AND EXTRACT(YEAR FROM ${expensesTable.date}) = ${y}`);

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
