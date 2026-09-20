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
  contributionsTable,
} from "@workspace/db";
import { sql, eq, and, inArray, isNull } from "drizzle-orm";
import {
  GetDashboardSummaryQueryParams,
  GetDashboardCategoryBreakdownQueryParams,
  GetDashboardCategoryLedgerQueryParams,
  GetDashboardSpendingByItemQueryParams,
  GetDashboardExpenseLedgerQueryParams,
  GetDashboardActivityQueryParams,
  GetDashboardIncomeStreamsQueryParams,
  GetDashboardIncomeStreamsResponse,
  GetDashboardPeriodTotalsQueryParams,
  GetDashboardPeriodTotalsResponse,
  GetDashboardMonthlyReportPdfQueryParams,
} from "@workspace/api-zod";
import { memberLedgerName } from "../lib/contributor-name";
import { effectiveBudgets, totalBudget as sumBudget } from "@workspace/category-tree";
import { getActiveGroupId } from "../lib/activeGroup";
import { buildContributionHistory, historyMonths } from "../lib/contribution-history";
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

  // The live total — never hardcoded, and never a plain SUM of every row.
  // A parent carries no budget of its own; it is the sum of its subcategories,
  // so adding both counted Food against its own Groceries.
  const budgetRows = await db
    .select({
      id: budgetCategoriesTable.id,
      parentId: budgetCategoriesTable.parentId,
      budgetAmount: budgetCategoriesTable.budgetAmount,
    })
    .from(budgetCategoriesTable)
    .where(sql`${budgetCategoriesTable.groupId} = ${groupId} AND (${budgetCategoriesTable.isRecurring} = true OR (${budgetCategoriesTable.activeMonth} = ${month} AND ${budgetCategoriesTable.activeYear} = ${year}))`);
  const totalBudget = sumBudget(budgetRows);

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
  // What the bank took in fees. Deliberately outside totalSpent: a charge is
  // money genuinely gone, but it is not household spending and belongs to no
  // category, so adding it would inflate every budget comparison by whatever
  // the bank happened to levy. Reported so it stops being invisible outside
  // the banking screen — until now the only way to see it was to go looking.
  const [bankChargesRow] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${jointAccountTxTable.amount}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(jointAccountTxTable)
    .where(sql`${jointAccountTxTable.groupId} = ${groupId}
      AND ${jointAccountTxTable.type} = 'disbursement'
      AND ${jointAccountTxTable.bankCharge} = true
      AND EXTRACT(MONTH FROM ${jointAccountTxTable.date}) = ${month}
      AND EXTRACT(YEAR FROM ${jointAccountTxTable.date}) = ${year}`);

  res.json({
    month, year,
    totalBudget,
    totalSpent,
    remaining: totalBudget - totalSpent,
    expenseCount: Number(countRow.count),
    memberContributions,
    bankChargesTotal: Number(bankChargesRow?.total ?? 0),
    bankChargesCount: Number(bankChargesRow?.count ?? 0),
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

  // Every category in the group, not just this month's, so a child whose
  // parent is not itself active this month still knows whose it is.
  const allGroupCategories = await db
    .select({ id: budgetCategoriesTable.id, name: budgetCategoriesTable.name })
    .from(budgetCategoriesTable)
    .where(eq(budgetCategoriesTable.groupId, groupId));
  const categoryNameById = new Map(allGroupCategories.map((row) => [row.id, row.name]));
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

  // A parent's figure is its subcategories added up, not a number of its own.
  const budgets = effectiveBudgets(categories);

  // What was charged to each category directly, before any rolling up. The
  // unbudgeted calculation below needs this: a parent that has absorbed its
  // children's spending would be counted twice against the month's real total
  // and hide genuinely unbudgeted spending.
  const ownSpent = new Map(categories.map((cat) => [
    cat.id,
    cat.name === UNCATEGORIZED_CATEGORY
      ? 0
      : (spentMap.get(cat.name) ?? 0) + (disbursementMap.get(cat.name) ?? 0),
  ]));
  const childSpent = new Map<number, number>();
  for (const cat of categories) {
    if (cat.parentId === null) continue;
    childSpent.set(cat.parentId, (childSpent.get(cat.parentId) ?? 0) + (ownSpent.get(cat.id) ?? 0));
  }

  const breakdown = categories.map((cat) => {
    // A parent is now measured as a branch: its budget is its children added
    // up, so its spending has to be too. Comparing a branch budget against
    // only what was charged to the parent by name would report money left
    // that the subcategories have already spent.
    const spentAmount = (ownSpent.get(cat.id) ?? 0) + (childSpent.get(cat.id) ?? 0);
    const budgetAmount = budgets.get(cat.id) ?? cat.budgetAmount;
    return {
      category: cat.name,
      budgetAmount,
      spentAmount,
      remaining: budgetAmount - spentAmount,
      percentUsed: Math.round(budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 * 10 : 0) / 10,
      priority: cat.priority,
      color: cat.color,
      isRecurring: cat.isRecurring,
      activeMonth: cat.activeMonth,
      activeYear: cat.activeYear,
      isBudgeted: true,
      // The breakdown is keyed by name throughout, so the parent is named
      // rather than referenced by id. Without it the Budget tab had no way to
      // tell a subcategory from a category and listed Groceries as a sibling
      // of Food.
      parentName: cat.parentId != null ? (categoryNameById.get(cat.parentId) ?? null) : null,
    };
  });

  const totalActual =
    Array.from(spentMap.values()).reduce((sum, spent) => sum + spent, 0) +
    Array.from(disbursementMap.values()).reduce((sum, spent) => sum + spent, 0);
  // Summed from what each category was charged directly, not from the rows
  // above: a parent there already includes its children's spending.
  const budgetedActual = Array.from(ownSpent.values()).reduce((sum, spent) => sum + spent, 0);
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
      // Spending with no budget behind it belongs to no parent.
      parentName: null,
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

  // The ledger could only ever answer "this month". A ledger is the thing
  // somebody opens to settle an argument about what was spent between two
  // dates, so it takes an exact `?from=&to=` range, defaulting to the month it
  // already showed — every existing caller asks for exactly what it did before.
  const { from: askedFrom, to: askedTo } = parsed.data;
  if ((askedFrom == null) !== (askedTo == null)) {
    // One bare end would quietly answer about a different span than was asked
    // for, and a ledger that answers the wrong question is worse than no ledger.
    res.status(400).json({ error: "Give both a start and an end date, or neither." });
    return;
  }
  const range = askedFrom != null && askedTo != null
    ? (askedFrom <= askedTo ? { from: askedFrom, to: askedTo } : { from: askedTo, to: askedFrom })
    : null;
  const ledgerFrom = range?.from ?? `${year}-${String(month).padStart(2, "0")}-01`;
  const ledgerTo = range?.to ?? new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

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
      .where(sql`${expensesTable.groupId} = ${groupId} AND ${expensesTable.date} >= ${ledgerFrom} AND ${expensesTable.date} <= ${ledgerTo}`),
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
      .where(sql`${jointAccountTxTable.groupId} = ${groupId} AND ${jointAccountTxTable.type} = 'disbursement' AND ${jointAccountTxTable.bankTransferId} IS NULL AND ${jointAccountTxTable.expenseCategory} IS NOT NULL AND ${jointAccountTxTable.expenseId} IS NULL AND ${jointAccountTxTable.date} >= ${ledgerFrom} AND ${jointAccountTxTable.date} <= ${ledgerTo}`),
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
      .where(sql`${expenseCategoryAllocationsTable.groupId} = ${groupId} AND ${expensesTable.date} >= ${ledgerFrom} AND ${expensesTable.date} <= ${ledgerTo}`)
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
 * Every expense in one list, newest first — a statement for the whole budget.
 *
 * Every other way into the expenses goes through something first: a category,
 * or a named thing. All of them answer "show me this one thing's entries".
 * None of them answers "show me everything that happened", which is the
 * question you have when you do not yet know which category to look in, or
 * when you are reconciling against an M-Pesa statement that knows nothing
 * about your categories.
 *
 * One row per expense, not per category portion: a shop split across Food and
 * Household is one thing that happened, and listing it twice would read as
 * two trips. The portions are named on the row instead.
 */
router.get("/dashboard/expense-ledger", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const parsed = GetDashboardExpenseLedgerQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }
  const { from: askedFrom, to: askedTo, q } = parsed.data;
  if ((askedFrom == null) !== (askedTo == null)) {
    res.status(400).json({ error: "Give both a start and an end date, or neither." });
    return;
  }

  const now = new Date();
  const month = parsed.data.month ?? now.getMonth() + 1;
  const year = parsed.data.year ?? now.getFullYear();
  const [from, to] = askedFrom != null && askedTo != null
    ? (askedFrom <= askedTo ? [askedFrom, askedTo] : [askedTo, askedFrom])
    : [
        `${year}-${String(month).padStart(2, "0")}-01`,
        new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
      ];

  const search = q?.trim() ? `%${q.trim().replace(/[!%_]/g, (ch) => `!${ch}`)}%` : null;

  const [expenses, disbursements, allocations] = await Promise.all([
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
      .where(sql`${expensesTable.groupId} = ${groupId}
        AND ${expensesTable.date} >= ${from}
        AND ${expensesTable.date} <= ${to}
        ${search ? sql`AND ${expensesTable.description} ILIKE ${search} ESCAPE '!'` : sql``}`),
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
      .where(sql`${jointAccountTxTable.groupId} = ${groupId}
        AND ${jointAccountTxTable.type} = 'disbursement'
        AND ${jointAccountTxTable.bankTransferId} IS NULL
        AND ${jointAccountTxTable.expenseCategory} IS NOT NULL
        AND ${jointAccountTxTable.expenseId} IS NULL
        AND ${jointAccountTxTable.date} >= ${from}
        AND ${jointAccountTxTable.date} <= ${to}
        ${search ? sql`AND ${jointAccountTxTable.description} ILIKE ${search} ESCAPE '!'` : sql``}`),
    db.select({
      expenseId: expenseCategoryAllocationsTable.expenseId,
      category: expenseCategoryAllocationsTable.category,
      position: expenseCategoryAllocationsTable.position,
    }).from(expenseCategoryAllocationsTable)
      .innerJoin(expensesTable, and(
        eq(expenseCategoryAllocationsTable.expenseId, expensesTable.id),
        eq(expenseCategoryAllocationsTable.groupId, expensesTable.groupId),
      ))
      .where(sql`${expenseCategoryAllocationsTable.groupId} = ${groupId} AND ${expensesTable.date} >= ${from} AND ${expensesTable.date} <= ${to}`)
      .orderBy(expenseCategoryAllocationsTable.position),
  ]);

  const entries = [
    ...expenses.map((expense) => {
      const portions = allocations.filter((allocation) => allocation.expenseId === expense.id);
      return {
        id: `expense-${expense.id}`,
        source: "expense" as const,
        // Named in the order they were allocated, so a split reads the way it
        // was entered rather than alphabetically.
        categories: (portions.length > 0 ? portions.map((portion) => portion.category) : [expense.category])
          .map(displayExpenseCategory),
        description: expense.description,
        amount: expense.amount,
        paidFromBank: expense.paidFromBank,
        payerName: expense.payerName ?? (expense.paidFromBank ? "Joint bank" : "Payer not recorded"),
        date: String(expense.date),
      };
    }),
    ...disbursements.map((disbursement) => ({
      id: `bank-disbursement-${disbursement.id}`,
      source: "bank_disbursement" as const,
      categories: [displayExpenseCategory(disbursement.category ?? "Uncategorized")],
      description: disbursement.description,
      amount: disbursement.amount,
      paidFromBank: true,
      payerName: disbursement.payerName ?? "Joint bank",
      date: String(disbursement.date),
    })),
  ].sort((a, b) => (a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date)));

  res.json({
    from,
    to,
    total: entries.reduce((sum, entry) => sum + entry.amount, 0),
    entries,
  });
});

/**
 * "How much have I spent on this?" — where "this" is a thing, not a category.
 *
 * Categories answer "how much on Food"; nobody budgets a category called
 * Netflix. The one field that already names the thing is the expense's own
 * description, so this groups by it and adds the money up. Grouping is on the
 * trimmed, lower-cased description, because "Netflix", "netflix " and
 * "NETFLIX" are one subscription; the label shown back is the spelling used
 * most recently, so it reads the way the person last typed it.
 *
 * The amount is the expense's full amount, not a category portion: a 5,000
 * shop split across Food and Household still cost 5,000.
 */
router.get("/dashboard/spending-by-item", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const parsed = GetDashboardSpendingByItemQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }
  const { from: askedFrom, to: askedTo, q, category, item } = parsed.data;
  if ((askedFrom == null) !== (askedTo == null)) {
    res.status(400).json({ error: "Give both a start and an end date, or neither." });
    return;
  }

  // Asked with no range at all, this answers about the last twelve months.
  // "How much do I spend on rent" is not a question about one month, and a
  // default that only ever covered the current one would answer it wrongly
  // more often than not.
  const today = new Date();
  const defaultTo = today.toISOString().slice(0, 10);
  const defaultFrom = new Date(Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const [from, to] = askedFrom != null && askedTo != null
    ? (askedFrom <= askedTo ? [askedFrom, askedTo] : [askedTo, askedFrom])
    : [defaultFrom, defaultTo];

  // A search is a plain substring on the name, not a pattern: somebody typing
  // "50% off" is naming a shop, not writing SQL.
  // `!` is the escape character rather than a backslash so the pattern needs
  // no escaping of its own on the way here.
  const search = q?.trim() ? `%${q.trim().replace(/[!%_]/g, (ch) => `!${ch}`)}%` : null;

  const rows = await db.execute(sql`
    SELECT (array_agg(e.description ORDER BY e.date DESC, e.id DESC))[1] AS "description",
           COALESCE(SUM(e.amount), 0) AS "total",
           COUNT(*) AS "count",
           MIN(e.date) AS "firstDate",
           MAX(e.date) AS "lastDate",
           array_agg(DISTINCT e.category) AS "categories"
    FROM expenses e
    WHERE e.group_id = ${groupId}
      AND e.date >= ${from}
      AND e.date <= ${to}
      ${search ? sql`AND e.description ILIKE ${search} ESCAPE '!'` : sql``}
      ${item ? sql`AND lower(btrim(e.description)) = lower(btrim(${item}))` : sql``}
      ${category ? sql`AND (
        e.category = ${category}
        OR EXISTS (
          SELECT 1 FROM expense_category_allocations a
          WHERE a.expense_id = e.id AND a.group_id = ${groupId} AND a.category = ${category}
        )
      )` : sql``}
    GROUP BY lower(btrim(e.description))
    ORDER BY "total" DESC
    LIMIT 200
  `);

  const items = (rows.rows as {
    description: string;
    total: string | number;
    count: string | number;
    firstDate: string;
    lastDate: string;
    categories: string[] | null;
  }[]).map((row) => ({
    description: row.description,
    total: Number(row.total),
    count: Number(row.count),
    firstDate: String(row.firstDate).slice(0, 10),
    lastDate: String(row.lastDate).slice(0, 10),
    categories: (row.categories ?? []).filter((name): name is string => typeof name === "string"),
  }));

  // "KES 3,600 on Netflix" invites "which three?". Naming an item returns the
  // expenses behind the figure, so the total can be checked rather than
  // believed.
  const entries = item == null ? null : await db.execute(sql`
    SELECT e.id AS "id",
           e.date AS "date",
           e.description AS "description",
           e.amount AS "amount",
           e.category AS "category",
           e.paid_from_bank AS "paidFromBank",
           u.preferred_name AS "preferredName",
           u.first_name AS "firstName",
           u.last_name AS "lastName"
    FROM expenses e
    LEFT JOIN users u ON u.id = e.paid_by_id
    WHERE e.group_id = ${groupId}
      AND e.date >= ${from}
      AND e.date <= ${to}
      AND lower(btrim(e.description)) = lower(btrim(${item}))
    ORDER BY e.date DESC, e.id DESC
    LIMIT 500
  `).then((result) => (result.rows as {
    id: number;
    date: string;
    description: string;
    amount: string | number;
    category: string;
    paidFromBank: boolean;
    preferredName: string | null;
    firstName: string | null;
    lastName: string | null;
  }[]).map((row) => ({
    id: Number(row.id),
    date: String(row.date).slice(0, 10),
    description: row.description,
    amount: Number(row.amount),
    category: row.category,
    paidFromBank: Boolean(row.paidFromBank),
    // The same rule the rest of the ledgers name people by, rather than a
    // bare first name that reads as somebody else in a group of cousins.
    payerName: memberLedgerName(row.preferredName, row.firstName, row.lastName)
      ?? (row.paidFromBank ? "Joint bank" : "Payer not recorded"),
  })));

  res.json({
    from,
    to,
    // The total of what is listed, so it always agrees with the rows above it
    // even when the 200-row cap has cut the tail off.
    total: items.reduce((sum, row) => sum + row.total, 0),
    items,
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
            AND bank_tx.bank_charge = true THEN bank_tx.amount
          ELSE 0
        END), 0) AS bank_charges_total,
        COUNT(*) FILTER (
          WHERE bank_tx.type = 'disbursement'
            AND bank_tx.bank_transfer_id IS NULL
            AND bank_tx.bank_charge = true
        ) AS bank_charges_count,
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
      bank_totals.bank_charges_total AS "bankChargesTotal",
      bank_totals.bank_charges_count AS "bankChargesCount",
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
    // Kept out of spendingTotal on purpose - a bank fee is not spending on the
    // group's purposes - but a real outflow the report still has to show.
    bankChargesTotal: numberValue("bankChargesTotal"),
    bankChargesCount: numberValue("bankChargesCount"),
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

/**
 * "1 – 14 September 2026" when the ends share a month, "28 August – 3 September
 * 2026" when they do not, and a single date when from and to are the same day.
 */
export function formatDayRangeLabel(from: string, to: string): string {
  const startDate = new Date(`${from}T00:00:00Z`);
  const endDate = new Date(`${to}T00:00:00Z`);
  const day = (value: Date) => String(value.getUTCDate());
  const monthYear = (value: Date) =>
    new Intl.DateTimeFormat("en-KE", { month: "long", year: "numeric", timeZone: "UTC" }).format(value);
  const monthOnly = (value: Date) =>
    new Intl.DateTimeFormat("en-KE", { month: "long", timeZone: "UTC" }).format(value);

  if (from === to) return `${day(startDate)} ${monthYear(startDate)}`;
  const sameMonth = startDate.getUTCFullYear() === endDate.getUTCFullYear()
    && startDate.getUTCMonth() === endDate.getUTCMonth();
  if (sameMonth) return `${day(startDate)} – ${day(endDate)} ${monthYear(startDate)}`;
  const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();
  const startPart = sameYear
    ? `${day(startDate)} ${monthOnly(startDate)}`
    : `${day(startDate)} ${monthYear(startDate)}`;
  return `${startPart} – ${day(endDate)} ${monthYear(endDate)}`;
}

router.get("/dashboard/monthly-report.pdf", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const now = new Date();
  const parsed = GetDashboardMonthlyReportPdfQueryParams.safeParse(req.query);
  const month = parsed.success && parsed.data.month != null ? Math.round(parsed.data.month) : now.getMonth() + 1;
  const year = parsed.success && parsed.data.year != null ? Math.round(parsed.data.year) : now.getFullYear();
  // An explicit `?from=&to=` day range, else the whole month. The report could
  // only ever answer "this month"; over a range it is the same report for the
  // days asked for.
  const isoDay = /^\d{4}-\d{2}-\d{2}$/;
  const askedFrom = typeof req.query.from === "string" && isoDay.test(req.query.from) ? req.query.from : null;
  const askedTo = typeof req.query.to === "string" && isoDay.test(req.query.to) ? req.query.to : null;
  // Both or neither: one bare end would quietly report a different span than
  // the caller asked for. Reversed ends are normalised rather than rejected.
  const dayRange = askedFrom && askedTo
    ? (askedFrom <= askedTo ? { from: askedFrom, to: askedTo } : { from: askedTo, to: askedFrom })
    : null;
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  // Day 0 of the next month is the last day of this one, leap years included.
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const rangeFrom = dayRange?.from ?? monthStart;
  const rangeTo = dayRange?.to ?? monthEnd;

  const [group] = await db
    .select({ name: groupsTable.name })
    .from(groupsTable)
    .where(eq(groupsTable.id, groupId))
    .limit(1);

  const [categories, spentByCategory, disbursementsByCategory, expenseTotal, incomeResult, bankChargesRow] = await Promise.all([
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
          AND expense.date >= ${rangeFrom} AND expense.date <= ${rangeTo}
        UNION ALL
        SELECT expense.category, expense.amount
        FROM expenses expense
        WHERE expense.group_id = ${groupId}
          AND expense.date >= ${rangeFrom} AND expense.date <= ${rangeTo}
          AND NOT EXISTS (SELECT 1 FROM expense_category_allocations allocation WHERE allocation.expense_id = expense.id AND allocation.group_id = ${groupId})
      ) allocated GROUP BY category
    `).then((result) => (result.rows as { category: string; total: string }[]).map((row) => ({ category: row.category, total: Number(row.total) }))),
    db
      .select({ category: jointAccountTxTable.expenseCategory, total: sql<number>`COALESCE(SUM(${jointAccountTxTable.amount}), 0)` })
      .from(jointAccountTxTable)
      .where(sql`${jointAccountTxTable.groupId} = ${groupId} AND ${jointAccountTxTable.type} = 'disbursement' AND ${jointAccountTxTable.bankTransferId} IS NULL AND ${jointAccountTxTable.expenseCategory} IS NOT NULL AND ${jointAccountTxTable.expenseId} IS NULL AND ${jointAccountTxTable.date} >= ${rangeFrom} AND ${jointAccountTxTable.date} <= ${rangeTo}`)
      .groupBy(jointAccountTxTable.expenseCategory),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(expensesTable)
      .where(sql`${expensesTable.groupId} = ${groupId} AND ${expensesTable.date} >= ${rangeFrom} AND ${expensesTable.date} <= ${rangeTo}`),
    db.execute(sql`
      WITH funding AS (
        SELECT split.income_source_id, split.amount, 'expense'::text AS record_type, expense.id AS record_id
        FROM expense_income_splits split
        INNER JOIN expenses expense ON expense.id = split.expense_id AND expense.group_id = ${groupId}
        WHERE split.group_id = ${groupId} AND split.from_bank = false
          AND expense.date >= ${rangeFrom} AND expense.date <= ${rangeTo}
        UNION ALL
        SELECT expense.income_source_id, expense.amount, 'expense'::text, expense.id
        FROM expenses expense
        WHERE expense.group_id = ${groupId} AND expense.paid_from_bank = false
          AND expense.date >= ${rangeFrom} AND expense.date <= ${rangeTo}
          AND NOT EXISTS (SELECT 1 FROM expense_income_splits split WHERE split.expense_id = expense.id AND split.group_id = ${groupId})
        UNION ALL
        SELECT split.income_source_id, split.amount, 'deposit'::text, deposit.id
        FROM joint_account_deposit_splits split
        INNER JOIN joint_account_transactions deposit ON deposit.id = split.transaction_id AND deposit.group_id = ${groupId}
        WHERE split.group_id = ${groupId} AND deposit.type = 'deposit'
          AND deposit.bank_transfer_id IS NULL
          AND deposit.transfer_direction IS DISTINCT FROM 'from_savings'
          AND deposit.date >= ${rangeFrom} AND deposit.date <= ${rangeTo}
        UNION ALL
        SELECT deposit.income_source_id, deposit.amount, 'deposit'::text, deposit.id
        FROM joint_account_transactions deposit
        WHERE deposit.group_id = ${groupId} AND deposit.type = 'deposit'
          AND deposit.bank_transfer_id IS NULL
          AND deposit.transfer_direction IS DISTINCT FROM 'from_savings'
          AND deposit.date >= ${rangeFrom} AND deposit.date <= ${rangeTo}
          AND NOT EXISTS (SELECT 1 FROM joint_account_deposit_splits split WHERE split.transaction_id = deposit.id AND split.group_id = ${groupId})
        UNION ALL
        SELECT NULL::integer, contribution.amount, 'savings'::text, contribution.id
        FROM savings_goal_contributions contribution
        WHERE contribution.group_id = ${groupId} AND contribution.created_by_user_id IS NOT NULL
          AND contribution.is_balance_correction = false
          AND contribution.note IS NULL
          AND contribution.created_at >= ${rangeFrom} AND contribution.created_at <= ${rangeTo}
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
    db
      .select({ total: sql<number>`COALESCE(SUM(${jointAccountTxTable.amount}), 0)` })
      .from(jointAccountTxTable)
      .where(sql`${jointAccountTxTable.groupId} = ${groupId}
        AND ${jointAccountTxTable.type} = 'disbursement'
        AND ${jointAccountTxTable.bankTransferId} IS NULL
        AND ${jointAccountTxTable.bankCharge} = true
        AND ${jointAccountTxTable.date} >= ${rangeFrom}
        AND ${jointAccountTxTable.date} <= ${rangeTo}`),
  ]);

  const spentMap = new Map(spentByCategory.map((item) => [item.category, item.total]));
  const disbursementMap = new Map(disbursementsByCategory.map((item) => [item.category, Number(item.total)]));
  const reportBudgets = effectiveBudgets(categories);
  const categoryRows = categories.map((category) => {
    const spentAmount = category.name === UNCATEGORIZED_CATEGORY
      ? 0
      : (spentMap.get(category.name) ?? 0) + (disbursementMap.get(category.name) ?? 0);
    // Same rule as the Budget tab, so a handed-out PDF and the phone agree.
    const budgetAmount = reportBudgets.get(category.id) ?? category.budgetAmount;
    return {
      category: category.name,
      budgetAmount,
      spentAmount,
      remaining: budgetAmount - spentAmount,
      percentUsed: Math.round(budgetAmount > 0 ? (spentAmount / budgetAmount) * 1000 : 0) / 10,
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
  // The label has to say what the report actually covers. A whole month keeps
  // reading "September 2026"; a day range names its own ends, so a handed-out
  // PDF cannot be mistaken for the full month.
  const monthLabel = dayRange
    ? formatDayRangeLabel(dayRange.from, dayRange.to)
    : new Intl.DateTimeFormat("en-KE", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
  // Not a sum of categoryRows: that list holds parents and their children
  // side by side, and a parent is already the sum of the children beside it.
  const totalBudget = sumBudget(categories);
  const pdf = await createMonthlyReportPdf({
    groupName: group?.name ?? "Shared group",
    monthLabel,
    coversWholeMonth: dayRange === null,
    totalBudget,
    totalSpent: totalActual,
    remaining: totalBudget - totalActual,
    expenseCount: Number(expenseTotal[0]?.count ?? 0),
    categories: categoryRows,
    totalFunding,
    bankChargesTotal: Number(bankChargesRow[0]?.total ?? 0),
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


/**
 * Who paid what, month by month, and what the group spent against it.
 *
 * The question a treasurer actually asks is not "what did we collect in
 * August" but "who has slipped". That needs a member against a row of months,
 * which every existing endpoint answers one cell at a time: /contributions is
 * one month, /dashboard/member-breakdown is one member in one month.
 *
 * Aggregated here rather than in the browser. Shipping every contribution row
 * to a phone so it can add them up is the wrong place to do arithmetic, and
 * the rows are nobody's business beyond their totals.
 *
 * Arrays line up with `months` by index, so the client renders a grid without
 * matching keys.
 */
router.get("/dashboard/contribution-history", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const monthsBack = Math.min(Math.max(Number(req.query.months) || 6, 1), 12);
  const months = historyMonths(monthsBack);
  const earliest = months[0];

  const [contributions, expenses, memberships] = await Promise.all([
    db
      .select({
        userId: contributionsTable.userId,
        firstName: usersTable.firstName,
        amount: contributionsTable.amount,
        month: contributionsTable.month,
        year: contributionsTable.year,
      })
      .from(contributionsTable)
      .leftJoin(usersTable, eq(contributionsTable.userId, usersTable.id))
      .where(sql`${contributionsTable.groupId} = ${groupId}
        AND (${contributionsTable.year} > ${earliest.year}
          OR (${contributionsTable.year} = ${earliest.year} AND ${contributionsTable.month} >= ${earliest.month}))`),
    db
      .select({
        total: sql<number>`COALESCE(SUM(${expensesTable.amount}), 0)`,
        month: sql<number>`EXTRACT(MONTH FROM ${expensesTable.date})`,
        year: sql<number>`EXTRACT(YEAR FROM ${expensesTable.date})`,
      })
      .from(expensesTable)
      .where(sql`${expensesTable.groupId} = ${groupId}
        AND ${expensesTable.date} >= make_date(${earliest.year}, ${earliest.month}, 1)`)
      .groupBy(sql`EXTRACT(YEAR FROM ${expensesTable.date}), EXTRACT(MONTH FROM ${expensesTable.date})`),
    db
      .select({ userId: groupMembershipsTable.userId, firstName: usersTable.firstName })
      .from(groupMembershipsTable)
      .leftJoin(usersTable, eq(groupMembershipsTable.userId, usersTable.id))
      .where(eq(groupMembershipsTable.groupId, groupId)),
  ]);

  res.json(buildContributionHistory({ months, contributions, expenses, memberships }));
});

export default router;
