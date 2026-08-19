import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  budgetCategoriesTable,
  jointAccountTxTable,
  usersTable,
  membersTable,
  savingsGoalsTable,
  savingsGoalContributionsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const DepositInput = z.object({
  amount: z.number().int().positive(),
  description: z.string().min(1),
  date: z.string().min(1),
  madeById: z.string().nullable().optional(),
  incomeSourceId: z.number().int().positive().optional(),
  sourceKind: z.enum(["income_source", "other"]).optional(),
});

const DisbursementInput = z.object({
  amount: z.number().int().positive(),
  description: z.string().trim().max(200).optional().default(""),
  date: z.string().min(1),
  madeById: z.string().nullable().optional(),
  expenseCategory: z.string().trim().min(1).max(80),
  destinationKind: z.enum(["category", "other"]).optional(),
});

const UpdateJointAccountInput = z.object({
  amount: z.number().int().positive(),
  description: z.string().trim().max(200).optional(),
  date: z.string().min(1),
  madeById: z.string().nullable().optional(),
  incomeSourceId: z.number().int().positive().nullable().optional(),
  expenseCategory: z.string().trim().min(1).max(80).optional(),
  sourceKind: z.enum(["income_source", "other"]).optional(),
  destinationKind: z.enum(["category", "other"]).optional(),
});

const IdParam = z.object({ id: z.coerce.number().int().positive() });
const SavingsTransferInput = z.object({
  amount: z.number().int().positive(),
  goalId: z.number().int().positive(),
  narration: z.string().trim().min(1).max(200),
  date: z.string().min(1),
  madeById: z.string().nullable().optional(),
});

async function enrichTx(tx: typeof jointAccountTxTable.$inferSelect) {
  const [user, savingsGoal] = await Promise.all([
    tx.madeById
      ? db.query.usersTable.findFirst({ where: eq(usersTable.id, tx.madeById) })
      : null,
    tx.savingsGoalId
      ? db.query.savingsGoalsTable.findFirst({ where: eq(savingsGoalsTable.id, tx.savingsGoalId) })
      : null,
  ]);
  return {
    ...tx,
    // null madeById = Joint bank (shared household); name resolves to null so UI can show "Joint bank"
    madeByName: user?.firstName ?? null,
    expenseCategory: tx.expenseCategory ?? null,
    savingsGoalId: tx.savingsGoalId ?? null,
    savingsGoalName: savingsGoal?.name ?? null,
    transferDirection: tx.transferDirection ?? null,
    createdAt: tx.createdAt instanceof Date ? tx.createdAt.toISOString() : tx.createdAt,
  };
}

/** Validate that a non-null member ID belongs to the household. Returns an error string or null. */
async function validateMemberId(id: string): Promise<string | null> {
  const [member] = await db
    .select({ userId: membersTable.userId })
    .from(membersTable)
    .where(eq(membersTable.userId, id))
    .limit(1);
  if (!member) return `Member ID '${id}' is not a recognised household member`;
  return null;
}

// GET /joint-account — returns balance + all transactions ordered newest first
router.get("/joint-account", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const txs = await db
    .select()
    .from(jointAccountTxTable)
    .orderBy(sql`${jointAccountTxTable.date} DESC, ${jointAccountTxTable.createdAt} DESC`);

  const enriched = await Promise.all(txs.map(enrichTx));

  const totalDeposits = txs.filter(t => t.type === "deposit").reduce((s, t) => s + t.amount, 0);
  const totalDisbursements = txs.filter(t => t.type === "disbursement").reduce((s, t) => s + t.amount, 0);
  const balance = totalDeposits - totalDisbursements;

  res.json({ balance, totalDeposits, totalDisbursements, transactions: enriched });
});

// POST /joint-account/deposit
router.post("/joint-account/deposit", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = DepositInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const { amount, description, date, incomeSourceId, sourceKind } = parsed.data;
  if (sourceKind === "other" && !description.trim()) {
    res.status(400).json({ error: "Add a narration for an Other source." });
    return;
  }
  // Explicit null or omitted → Joint bank (null). Never fall back to req.user.
  const madeById = parsed.data.madeById ?? null;

  if (madeById !== null) {
    const err = await validateMemberId(madeById);
    if (err) { res.status(400).json({ error: err }); return; }
  }

  const [tx] = await db
    .insert(jointAccountTxTable)
    .values({ type: "deposit", amount, description, date, madeById, incomeSourceId: incomeSourceId ?? null })
    .returning();

  res.status(201).json(await enrichTx(tx));
});

// POST /joint-account/disbursement
router.post("/joint-account/disbursement", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = DisbursementInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const { amount, description, date, expenseCategory, destinationKind } = parsed.data;
  if (destinationKind === "other" && !description.trim()) {
    res.status(400).json({ error: "Add a narration for an Other destination." });
    return;
  }
  // Explicit null or omitted → Joint bank (null). Never fall back to req.user.
  const madeById = parsed.data.madeById ?? null;

  if (madeById !== null) {
    const err = await validateMemberId(madeById);
    if (err) { res.status(400).json({ error: err }); return; }
  }

  const [category] = await db
    .select({ id: budgetCategoriesTable.id })
    .from(budgetCategoriesTable)
    .where(eq(budgetCategoriesTable.name, expenseCategory))
    .limit(1);
  if (!category) {
    res.status(400).json({ error: "Choose a valid budget category." });
    return;
  }

  const [tx] = await db
    .insert(jointAccountTxTable)
    .values({
      type: "disbursement",
      amount,
      // Description is a supporting note. When omitted, retain a meaningful
      // non-null value while reports remain anchored on expenseCategory.
      description: description || expenseCategory,
      date,
      madeById,
      expenseCategory,
    })
    .returning();

  res.status(201).json(await enrichTx(tx));
});

async function createSavingsTransfer(
  req: Request,
  res: Response,
  direction: "to_savings" | "from_savings",
): Promise<void> {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = SavingsTransferInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid transfer details" }); return; }

  const { amount, goalId, narration, date } = parsed.data;
  const madeById = parsed.data.madeById ?? null;
  if (madeById !== null) {
    const err = await validateMemberId(madeById);
    if (err) { res.status(400).json({ error: err }); return; }
  }

  const result = await db.transaction(async (tx) => {
    const [goal] = await tx
      .select()
      .from(savingsGoalsTable)
      .where(eq(savingsGoalsTable.id, goalId))
      .for("update");
    if (!goal) return { error: "Savings goal not found.", status: 404 as const };

    if (direction === "to_savings") {
      const remaining = goal.targetAmount - goal.currentAmount;
      if (amount > remaining) {
        return { error: `Only KES ${remaining} can be moved into this goal.`, status: 400 as const };
      }
    } else if (amount > goal.currentAmount) {
      return { error: `Only KES ${goal.currentAmount} is available in this goal.`, status: 400 as const };
    }

    const type = direction === "to_savings" ? "disbursement" : "deposit";
    const description = direction === "to_savings"
      ? `Transfer to savings — ${narration}`
      : `Transfer from savings — ${narration}`;
    const [bankTx] = await tx
      .insert(jointAccountTxTable)
      .values({
        type,
        amount,
        description,
        date,
        madeById,
        incomeSourceId: null,
        expenseCategory: null,
        savingsGoalId: goal.id,
        transferDirection: direction,
      })
      .returning();

    const delta = direction === "to_savings" ? amount : -amount;
    const nextAmount = goal.currentAmount + delta;
    await tx
      .update(savingsGoalsTable)
      .set({
        currentAmount: nextAmount,
        isCompleted: nextAmount >= goal.targetAmount,
      })
      .where(eq(savingsGoalsTable.id, goal.id));
    await tx.insert(savingsGoalContributionsTable).values({
      goalId: goal.id,
      amount: delta,
      note: direction === "to_savings"
        ? `Bank transfer in: ${narration}`
        : `Bank transfer out: ${narration}`,
      createdByUserId: null,
      bankTransactionId: bankTx.id,
    });
    return { bankTx };
  });

  const bankTx = result.bankTx;
  if (!bankTx) {
    res.status(result.status ?? 400).json({ error: result.error ?? "Could not create transfer." });
    return;
  }
  res.status(201).json(await enrichTx(bankTx));
}

router.post("/joint-account/transfers/to-savings", async (req, res): Promise<void> => {
  await createSavingsTransfer(req, res, "to_savings");
});

router.post("/joint-account/transfers/from-savings", async (req, res): Promise<void> => {
  await createSavingsTransfer(req, res, "from_savings");
});

// PUT /joint-account/:id — edit a transaction without changing its type.
router.put("/joint-account/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = IdParam.safeParse(req.params);
  const parsed = UpdateJointAccountInput.safeParse(req.body);
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const [existing] = await db
    .select()
    .from(jointAccountTxTable)
    .where(eq(jointAccountTxTable.id, params.data.id))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.savingsGoalId !== null) {
    res.status(400).json({ error: "Savings transfers cannot be edited. Delete and recreate the transfer instead." });
    return;
  }

  const { amount, date } = parsed.data;
  const madeById = parsed.data.madeById === undefined ? existing.madeById : parsed.data.madeById;
  if (madeById !== null) {
    const err = await validateMemberId(madeById);
    if (err) { res.status(400).json({ error: err }); return; }
  }

  if (existing.type === "deposit") {
    const description = parsed.data.description ?? existing.description;
    if (!description) { res.status(400).json({ error: "A deposit description is required." }); return; }
    if (parsed.data.sourceKind === "other" && !description.trim()) {
      res.status(400).json({ error: "Add a narration for an Other source." });
      return;
    }
    const incomeSourceId = parsed.data.incomeSourceId === undefined
      ? existing.incomeSourceId
      : parsed.data.incomeSourceId;
    const [updated] = await db
      .update(jointAccountTxTable)
      .set({ amount, date, madeById, description, incomeSourceId, expenseCategory: null })
      .where(eq(jointAccountTxTable.id, existing.id))
      .returning();
    res.json(await enrichTx(updated));
    return;
  }

  const expenseCategory = parsed.data.expenseCategory ?? existing.expenseCategory;
  if (!expenseCategory) {
    res.status(400).json({ error: "Choose a valid budget category." });
    return;
  }
  const [category] = await db
    .select({ id: budgetCategoriesTable.id })
    .from(budgetCategoriesTable)
    .where(eq(budgetCategoriesTable.name, expenseCategory))
    .limit(1);
  if (!category) {
    res.status(400).json({ error: "Choose a valid budget category." });
    return;
  }

  const description = parsed.data.description === undefined
    ? existing.description
    : parsed.data.description || expenseCategory;
  if (parsed.data.destinationKind === "other" && !description.trim()) {
    res.status(400).json({ error: "Add a narration for an Other destination." });
    return;
  }
  const [updated] = await db
    .update(jointAccountTxTable)
    .set({ amount, date, madeById, description, expenseCategory })
    .where(eq(jointAccountTxTable.id, existing.id))
    .returning();
  res.json(await enrichTx(updated));
});

// DELETE /joint-account/:id
router.delete("/joint-account/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = IdParam.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const deleteResult = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(jointAccountTxTable)
      .where(eq(jointAccountTxTable.id, parsed.data.id))
      .for("update");
    if (!existing) return null;

    if (existing.savingsGoalId !== null) {
      const [goal] = await tx
        .select()
        .from(savingsGoalsTable)
        .where(eq(savingsGoalsTable.id, existing.savingsGoalId))
        .for("update");
      if (!goal) return { orphanedTransfer: true };
      const reverseDelta = existing.transferDirection === "to_savings"
        ? -existing.amount
        : existing.amount;
      const nextAmount = goal.currentAmount + reverseDelta;
      if (nextAmount < 0) return { cannotReverse: true };
      await tx
        .update(savingsGoalsTable)
        .set({
          currentAmount: nextAmount,
          isCompleted: nextAmount >= goal.targetAmount,
        })
        .where(eq(savingsGoalsTable.id, goal.id));
      await tx
        .delete(savingsGoalContributionsTable)
        .where(eq(savingsGoalContributionsTable.bankTransactionId, existing.id));
    }

    const [removed] = await tx
      .delete(jointAccountTxTable)
      .where(eq(jointAccountTxTable.id, existing.id))
      .returning();
    return { deleted: removed };
  });

  if (!deleteResult) { res.status(404).json({ error: "Not found" }); return; }
  if ("orphanedTransfer" in deleteResult) {
    res.status(409).json({ error: "This transfer's savings goal no longer exists. Contact support before changing this bank record." });
    return;
  }
  if ("cannotReverse" in deleteResult) {
    res.status(409).json({ error: "Savings balance changed; this transfer can no longer be reversed." });
    return;
  }
  if (!deleteResult.deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ success: true });
});

export default router;
