import { Router } from "express";
import { db } from "@workspace/db";
import {
  expensesTable,
  usersTable,
  membersTable,
  incomeSourcesTable,
  expenseIncomeSplitsTable,
  jointAccountTxTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import {
  CreateExpenseBody,
  UpdateExpenseBody,
  DeleteExpenseParams,
  GetExpensesQueryParams,
} from "@workspace/api-zod";
import { getActiveGroupId } from "../lib/activeGroup";

const router = Router();

const FundingSplitSchema = z.object({
  userId: z.string().nullable().optional(),
  label: z.string().trim().min(1).optional(),
  amount: z.number().int().positive(),
  incomeSourceId: z.number().int().positive().optional(),
  fromBank: z.boolean(),
});

type FundingSplit = z.infer<typeof FundingSplitSchema>;

type ExpenseRow = {
  id: number;
  amount: number;
  category: string;
  description: string;
  notes: string | null;
  paidById: string | null;
  paidByName: string | null;
  incomeSourceId: number | null;
  paidFromBank: boolean;
  isRecurring: boolean;
  date: string | Date | null;
  createdAt: Date | string;
};

function formatExpense(e: ExpenseRow, incomeSplits: unknown[] = []) {
  return {
    ...e,
    notes: e.notes ?? null,
    paidById: e.paidById ?? null,
    paidByName: e.paidByName ?? (e.paidFromBank ? "Joint bank" : "Unknown"),
    paidFromBank: e.paidFromBank ?? false,
    isRecurring: e.isRecurring ?? false,
    incomeSplits,
    date: typeof e.date === "string" ? e.date : e.date?.toISOString().split("T")[0],
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
  };
}

async function validateMemberId(id: string, groupId: number): Promise<string | null> {
  const member = await db.query.membersTable.findFirst({
    where: and(eq(membersTable.userId, id), eq(membersTable.groupId, groupId)),
  });
  return member ? null : "Each personal funding source must be a recognised household member.";
}

async function validateIncomeSource(id: number, groupId: number): Promise<string | null> {
  const source = await db.query.incomeSourcesTable.findFirst({
    where: and(eq(incomeSourcesTable.id, id), eq(incomeSourcesTable.groupId, groupId)),
  });
  return source ? null : "incomeSourceId not found.";
}

/**
 * Turns optional funding portions into a validated, explicit source model.
 * Undefined means legacy single-source fields should be preserved; [] is not a
 * valid payment because every source portion must be positive.
 */
async function validateFundingSplits(raw: unknown, amount: number, groupId: number): Promise<
  { splits?: FundingSplit[]; error?: string }
> {
  if (raw === undefined) return {};
  const parsed = z.array(FundingSplitSchema).min(1).safeParse(raw);
  if (!parsed.success) return { error: "Each funding portion needs a positive whole-KES amount." };
  const splits = parsed.data;
  const total = splits.reduce((sum, split) => sum + split.amount, 0);
  if (total !== amount) return { error: `Funding portions (${total}) must equal the expense total (${amount}).` };

  for (const split of splits) {
    if (split.fromBank) {
      if (split.userId) return { error: "A Joint-bank portion cannot name a personal payer." };
      continue;
    }
    if (!split.userId) return { error: "Choose a household member for every personal funding portion." };
    const memberError = await validateMemberId(split.userId, groupId);
    if (memberError) return { error: memberError };
    if (split.incomeSourceId) {
      const sourceError = await validateIncomeSource(split.incomeSourceId, groupId);
      if (sourceError) return { error: sourceError };
    }
  }
  return { splits };
}

function splitLabel(split: FundingSplit) {
  if (split.fromBank) return "Joint bank";
  return split.label ?? "Household member";
}

function toDateString(value: string | Date) {
  return typeof value === "string" ? value : value.toISOString().split("T")[0];
}

async function getExpenseSplits(expenseIds: number[], groupId: number) {
  if (expenseIds.length === 0) return new Map<number, unknown[]>();
  const rows = await db
    .select({
      id: expenseIncomeSplitsTable.id,
      expenseId: expenseIncomeSplitsTable.expenseId,
      userId: expenseIncomeSplitsTable.userId,
      label: expenseIncomeSplitsTable.label,
      amount: expenseIncomeSplitsTable.amount,
      incomeSourceId: expenseIncomeSplitsTable.incomeSourceId,
      fromBank: expenseIncomeSplitsTable.fromBank,
    })
    .from(expenseIncomeSplitsTable)
    .where(and(
      sql`${expenseIncomeSplitsTable.expenseId} = ANY(${expenseIds})`,
      eq(expenseIncomeSplitsTable.groupId, groupId),
    ));
  return rows.reduce((byExpense, row) => {
    const current = byExpense.get(row.expenseId) ?? [];
    current.push(row);
    byExpense.set(row.expenseId, current);
    return byExpense;
  }, new Map<number, unknown[]>());
}

async function writeFundingSplits(
  tx: any,
  expenseId: number,
  splits: FundingSplit[],
  groupId: number,
) {
  if (splits.length === 0) return;
  await tx.insert(expenseIncomeSplitsTable).values(splits.map((split) => ({
    expenseId,
    groupId,
    userId: split.fromBank ? null : split.userId ?? null,
    label: splitLabel(split),
    amount: split.amount,
    incomeSourceId: split.incomeSourceId ?? null,
    fromBank: split.fromBank,
  })));
}

async function syncJointBankDisbursement(
  tx: any,
  expense: { id: number; category: string; description: string; date: string | Date | null },
  bankAmount: number,
  groupId: number,
) {
  const existing = await tx
    .select({ id: jointAccountTxTable.id })
    .from(jointAccountTxTable)
    .where(and(eq(jointAccountTxTable.expenseId, expense.id), eq(jointAccountTxTable.groupId, groupId)))
    .limit(1);
  const description = `Expense funding: ${expense.description}`;
  const date = expense.date ? toDateString(expense.date) : "";

  if (bankAmount === 0) {
    if (existing[0]) await tx.delete(jointAccountTxTable).where(eq(jointAccountTxTable.id, existing[0].id));
    return;
  }
  if (existing[0]) {
    await tx.update(jointAccountTxTable)
      .set({ amount: bankAmount, description, expenseCategory: expense.category, date })
      .where(eq(jointAccountTxTable.id, existing[0].id));
    return;
  }
  await tx.insert(jointAccountTxTable).values({
    type: "disbursement",
    amount: bankAmount,
    description,
    madeById: null,
    expenseCategory: expense.category,
    expenseId: expense.id,
    groupId,
    date,
  });
}

router.get("/expenses", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const parsed = GetExpensesQueryParams.safeParse(req.query);
  const { month, year, category } = parsed.success ? parsed.data : {};
  const conditions: ReturnType<typeof eq>[] = [eq(expensesTable.groupId, groupId)];
  if (month !== undefined && year !== undefined) {
    conditions.push(sql`EXTRACT(MONTH FROM ${expensesTable.date}) = ${month}`, sql`EXTRACT(YEAR FROM ${expensesTable.date}) = ${year}`);
  } else if (year !== undefined) {
    conditions.push(sql`EXTRACT(YEAR FROM ${expensesTable.date}) = ${year}`);
  }
  if (category) conditions.push(eq(expensesTable.category, category));

  const expenses = await db.select({
    id: expensesTable.id, amount: expensesTable.amount, category: expensesTable.category,
    description: expensesTable.description, notes: expensesTable.notes, paidById: expensesTable.paidById,
    paidByName: usersTable.firstName, incomeSourceId: expensesTable.incomeSourceId,
    paidFromBank: expensesTable.paidFromBank, isRecurring: expensesTable.isRecurring,
    date: expensesTable.date, createdAt: expensesTable.createdAt,
  }).from(expensesTable)
    .leftJoin(usersTable, eq(expensesTable.paidById, usersTable.id))
    .where(and(...conditions))
    .orderBy(sql`${expensesTable.date} DESC, ${expensesTable.createdAt} DESC`);

  const splitsByExpense = await getExpenseSplits(expenses.map((expense) => expense.id), groupId);
  res.json(expenses.map((expense) => formatExpense(expense, splitsByExpense.get(expense.id) ?? [])));
});

// POST /expenses/apply-recurring — must be before /:id route
router.post("/expenses/apply-recurring", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const parsed = z.object({ month: z.number(), year: z.number() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const { month, year } = parsed.data;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const recurring = await db.select().from(expensesTable).where(and(
    eq(expensesTable.groupId, groupId),
    eq(expensesTable.isRecurring, true),
    sql`EXTRACT(MONTH FROM ${expensesTable.date}) = ${prevMonth}`,
    sql`EXTRACT(YEAR FROM ${expensesTable.date}) = ${prevYear}`,
  ));
  const existing = await db.select({ category: expensesTable.category, description: expensesTable.description })
    .from(expensesTable).where(and(
      eq(expensesTable.groupId, groupId),
      sql`EXTRACT(MONTH FROM ${expensesTable.date}) = ${month}`,
      sql`EXTRACT(YEAR FROM ${expensesTable.date}) = ${year}`,
    ));
  const existingKeys = new Set(existing.map((expense) => `${expense.category}||${expense.description}`));
  const toInsert = recurring.filter((expense) => !existingKeys.has(`${expense.category}||${expense.description}`));
  const newDate = `${year}-${String(month).padStart(2, "0")}-01`;

  await db.transaction(async (tx) => {
    for (const original of toInsert) {
      const [created] = await tx.insert(expensesTable).values({
        groupId,
        amount: original.amount, category: original.category, description: original.description,
        notes: original.notes, paidById: original.paidById, incomeSourceId: original.incomeSourceId,
        paidFromBank: original.paidFromBank, isRecurring: true, date: newDate,
      }).returning();
      const sourceSplits = await tx.select().from(expenseIncomeSplitsTable)
        .where(and(
          eq(expenseIncomeSplitsTable.expenseId, original.id),
          eq(expenseIncomeSplitsTable.groupId, groupId),
        ));
      if (sourceSplits.length > 0) {
        await tx.insert(expenseIncomeSplitsTable).values(sourceSplits.map((split) => ({
          expenseId: created.id, groupId, userId: split.userId, label: split.label, amount: split.amount,
          incomeSourceId: split.incomeSourceId, fromBank: split.fromBank,
        })));
      }
      const bankAmount = sourceSplits.length > 0
        ? sourceSplits.filter((split) => split.fromBank).reduce((sum, split) => sum + split.amount, 0)
        : (created.paidFromBank ? created.amount : 0);
      await syncJointBankDisbursement(tx, created, bankAmount, groupId);
    }
  });
  res.json({ copied: toInsert.length });
});

router.post("/expenses", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const parsed = CreateExpenseBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const { amount, category, description, notes, paidById, isRecurring, date, incomeSourceId, paidFromBank, incomeSplits } = parsed.data;
  const splitResult = await validateFundingSplits(incomeSplits, amount, groupId);
  if (splitResult.error) { res.status(400).json({ error: splitResult.error }); return; }
  if (!splitResult.splits && !paidById && !paidFromBank) {
    res.status(400).json({ error: "Choose who paid or select Joint bank." }); return;
  }
  if (!splitResult.splits && paidById) {
    const error = await validateMemberId(paidById, groupId);
    if (error) { res.status(400).json({ error }); return; }
  }
  if (!splitResult.splits && incomeSourceId) {
    const error = await validateIncomeSource(incomeSourceId, groupId);
    if (error) { res.status(400).json({ error }); return; }
  }

  const expense = await db.transaction(async (tx) => {
    const splits = splitResult.splits;
    const namedPayer = splits?.find((split) => !split.fromBank)?.userId ?? paidById ?? null;
    const allBank = splits ? splits.every((split) => split.fromBank) : paidFromBank === true;
    const [created] = await tx.insert(expensesTable).values({
      groupId,
      amount, category, description, notes: notes ?? null, paidById: namedPayer,
      incomeSourceId: incomeSourceId ?? null, paidFromBank: allBank,
      isRecurring: isRecurring ?? false, date: toDateString(date),
    }).returning();
    if (splits) await writeFundingSplits(tx, created.id, splits, groupId);
    const bankAmount = splits
      ? splits.filter((split) => split.fromBank).reduce((sum, split) => sum + split.amount, 0)
      : (allBank ? amount : 0);
    await syncJointBankDisbursement(tx, created, bankAmount, groupId);
    return created;
  });
  const payer = expense.paidById ? await db.query.usersTable.findFirst({ where: eq(usersTable.id, expense.paidById) }) : null;
  const splits = await getExpenseSplits([expense.id], groupId);
  res.status(201).json(formatExpense({ ...expense, paidByName: payer?.firstName ?? null }, splits.get(expense.id) ?? []));
});

router.patch("/expenses/:id", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const idParsed = DeleteExpenseParams.safeParse(req.params);
  const parsed = UpdateExpenseBody.safeParse(req.body);
  if (!idParsed.success || !parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const expenseId = idParsed.data.id;
  const { amount, category, description, notes, paidById, isRecurring, date, incomeSourceId, paidFromBank, incomeSplits } = parsed.data;
  const splitResult = await validateFundingSplits(incomeSplits, amount, groupId);
  if (splitResult.error) { res.status(400).json({ error: splitResult.error }); return; }
  // Legacy (non-split) updates must retain the same attribution safeguards as
  // creation. Split portions validate themselves above.
  if (!splitResult.splits && paidById) {
    const error = await validateMemberId(paidById, groupId);
    if (error) { res.status(400).json({ error }); return; }
  }
  if (!splitResult.splits && incomeSourceId) {
    const error = await validateIncomeSource(incomeSourceId, groupId);
    if (error) { res.status(400).json({ error }); return; }
  }

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(expensesTable)
      .where(and(eq(expensesTable.id, expenseId), eq(expensesTable.groupId, groupId)))
      .for("update");
    if (!existing) return null;
    const previousSplits = await tx.select().from(expenseIncomeSplitsTable)
      .where(and(
        eq(expenseIncomeSplitsTable.expenseId, expenseId),
        eq(expenseIncomeSplitsTable.groupId, groupId),
      ));
    // Keeping a historic split unchanged is supported for description/date edits.
    // Changing its total requires an explicit replacement split so it cannot drift.
    if (!splitResult.splits && previousSplits.length > 0 && amount !== existing.amount) {
      return { error: "Provide updated funding portions when changing the amount of a split-funded expense." };
    }
    const splits = splitResult.splits;
    const allBank = splits
      ? splits.every((split) => split.fromBank)
      : (paidFromBank ?? existing.paidFromBank);
    // An all-Joint-bank action has no personal payer. Explicitly clear the
    // legacy field instead of falling back to the expense's old attribution.
    const namedPayer = splits
      ? (allBank ? null : splits.find((split) => !split.fromBank)?.userId ?? null)
      : (allBank ? null : paidById ?? existing.paidById);
    const [updated] = await tx.update(expensesTable).set({
      amount, category, description, notes: notes ?? null, paidById: namedPayer,
      incomeSourceId: allBank ? null : incomeSourceId ?? existing.incomeSourceId, paidFromBank: allBank,
      isRecurring: isRecurring ?? false, date: toDateString(date),
    }).where(and(eq(expensesTable.id, expenseId), eq(expensesTable.groupId, groupId))).returning();
    if (splits) {
      await tx.delete(expenseIncomeSplitsTable).where(and(
        eq(expenseIncomeSplitsTable.expenseId, expenseId),
        eq(expenseIncomeSplitsTable.groupId, groupId),
      ));
      await writeFundingSplits(tx, expenseId, splits, groupId);
    }
    const effectiveSplits = splits ?? previousSplits.map((split) => ({
      userId: split.userId, label: split.label, amount: split.amount,
      incomeSourceId: split.incomeSourceId ?? undefined, fromBank: split.fromBank,
    }));
    const bankAmount = effectiveSplits.length > 0
      ? effectiveSplits.filter((split) => split.fromBank).reduce((sum, split) => sum + split.amount, 0)
      : (allBank ? amount : 0);
    await syncJointBankDisbursement(tx, updated, bankAmount, groupId);
    return { updated };
  });
  if (!result) { res.status(404).json({ error: "Not found" }); return; }
  if ("error" in result) { res.status(400).json({ error: result.error }); return; }
  const payer = result.updated.paidById ? await db.query.usersTable.findFirst({ where: eq(usersTable.id, result.updated.paidById) }) : null;
  const splits = await getExpenseSplits([expenseId], groupId);
  res.json(formatExpense({ ...result.updated, paidByName: payer?.firstName ?? null }, splits.get(expenseId) ?? []));
});

router.delete("/expenses/:id", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const parsed = DeleteExpenseParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const deleted = await db.transaction(async (tx) => {
    // Only delete the joint-account disbursement that belongs to this group
    await tx.delete(jointAccountTxTable).where(and(
      eq(jointAccountTxTable.expenseId, parsed.data.id),
      eq(jointAccountTxTable.groupId, groupId),
    ));
    const [removed] = await tx.delete(expensesTable).where(and(
      eq(expensesTable.id, parsed.data.id),
      eq(expensesTable.groupId, groupId),
    )).returning();
    return removed;
  });
  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ success: true });
});

export default router;
