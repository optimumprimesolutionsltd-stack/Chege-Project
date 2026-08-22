import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  budgetCategoriesTable,
  groupMembershipsTable,
  jointAccountTxTable,
  usersTable,
  savingsGoalsTable,
  savingsGoalContributionsTable,
  jointAccountDepositSplitsTable,
  incomeSourcesTable,
  groupsTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  getActiveGroupId,
  requireGroupManager,
  requireMemberSelfAttribution,
} from "../lib/activeGroup";

const router = Router();

async function validateIncomeSourceOwner(
  incomeSourceId: number,
  userId: string | null | undefined,
  groupId: number,
): Promise<string | null> {
  if (!userId) return "Choose a named depositor before selecting an income source.";
  const source = await db.query.incomeSourcesTable.findFirst({
    where: and(
      eq(incomeSourcesTable.id, incomeSourceId),
      eq(incomeSourcesTable.groupId, groupId),
    ),
  });
  if (!source) return "Income source not found.";
  return source.userId === userId
    ? null
    : "The selected income source belongs to a different member.";
}

const DepositInput = z.object({
  amount: z.number().int().positive(),
  description: z.string().min(1),
  date: z.string().min(1),
  madeById: z.string().nullable().optional(),
  incomeSourceId: z.number().int().positive().optional(),
  sourceKind: z.enum(["income_source", "other"]).optional(),
  contributorSplits: z.array(z.object({
    userId: z.string().min(1),
    amount: z.number().int().positive(),
    incomeSourceId: z.number().int().positive().optional(),
  })).min(1).optional(),
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
const OpeningBalanceInput = z.object({
  openingBalance: z.number().int().nonnegative(),
});
const SavingsTransferInput = z.object({
  amount: z.number().int().positive(),
  goalId: z.number().int().positive(),
  narration: z.string().trim().min(1).max(200),
  date: z.string().min(1),
  madeById: z.string().nullable().optional(),
});

async function enrichTx(
  tx: typeof jointAccountTxTable.$inferSelect,
  groupId: number,
) {
  const [user, savingsGoal, contributorSplits] = await Promise.all([
    tx.madeById
      ? db.select({ firstName: usersTable.firstName })
          .from(groupMembershipsTable)
          .innerJoin(usersTable, eq(usersTable.id, groupMembershipsTable.userId))
          .where(and(
            eq(groupMembershipsTable.groupId, groupId),
            eq(groupMembershipsTable.userId, tx.madeById),
          ))
          .then((rows) => rows[0] ?? null)
      : null,
    tx.savingsGoalId
      ? db.query.savingsGoalsTable.findFirst({
          where: and(
            eq(savingsGoalsTable.id, tx.savingsGoalId),
            eq(savingsGoalsTable.groupId, groupId),
          ),
        })
      : null,
    tx.type === "deposit"
      ? db.select({
        userId: jointAccountDepositSplitsTable.userId,
        amount: jointAccountDepositSplitsTable.amount,
        incomeSourceId: jointAccountDepositSplitsTable.incomeSourceId,
        userName: usersTable.firstName,
      })
        .from(jointAccountDepositSplitsTable)
        .leftJoin(usersTable, eq(jointAccountDepositSplitsTable.userId, usersTable.id))
        .where(and(
          eq(jointAccountDepositSplitsTable.transactionId, tx.id),
          eq(jointAccountDepositSplitsTable.groupId, groupId),
        ))
      : Promise.resolve([]),
  ]);
  const madeByName = contributorSplits.length === 1
    ? (contributorSplits[0].userName ?? "Member")
    : contributorSplits.length > 1
      ? `${contributorSplits.length} contributors`
      : (user?.firstName ?? null);
  return {
    ...tx,
    // null madeById = Joint bank (shared household); name resolves to null so UI can show "Joint bank"
    madeByName,
    expenseCategory: tx.expenseCategory ?? null,
    savingsGoalId: tx.savingsGoalId ?? null,
    savingsGoalName: savingsGoal?.name ?? null,
    transferDirection: tx.transferDirection ?? null,
    expenseId: tx.expenseId ?? null,
    contributorSplits: contributorSplits.map((split) => ({
      userId: split.userId,
      userName: split.userName ?? "Member",
      amount: split.amount,
      incomeSourceId: split.incomeSourceId ?? null,
    })),
    createdAt: tx.createdAt instanceof Date ? tx.createdAt.toISOString() : tx.createdAt,
  };
}

/** Validate that a non-null member ID belongs to the active group. Returns an error string or null. */
async function validateMemberId(id: string, groupId: number): Promise<string | null> {
  const [member] = await db
    .select({ userId: groupMembershipsTable.userId })
    .from(groupMembershipsTable)
    .where(and(eq(groupMembershipsTable.userId, id), eq(groupMembershipsTable.groupId, groupId)))
    .limit(1);
  if (!member) return `Member ID '${id}' is not a recognised household member`;
  return null;
}

// GET /joint-account — returns the running balance plus all transactions ordered newest first.
// The running balance starts at the workspace's manually entered opening balance.
router.get("/joint-account", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const [[group], txs] = await Promise.all([
    db
      .select({ openingBalance: groupsTable.bankOpeningBalance })
      .from(groupsTable)
      .where(eq(groupsTable.id, groupId))
      .limit(1),
    db
      .select()
      .from(jointAccountTxTable)
      .where(eq(jointAccountTxTable.groupId, groupId))
      .orderBy(sql`${jointAccountTxTable.date} DESC, ${jointAccountTxTable.createdAt} DESC`),
  ]);

  const enriched = await Promise.all(txs.map((tx) => enrichTx(tx, groupId)));

  const totalDeposits = txs.filter(t => t.type === "deposit").reduce((s, t) => s + t.amount, 0);
  const totalDisbursements = txs.filter(t => t.type === "disbursement").reduce((s, t) => s + t.amount, 0);
  const openingBalance = group?.openingBalance ?? 0;
  const balance = openingBalance + totalDeposits - totalDisbursements;

  res.json({ openingBalance, balance, totalDeposits, totalDisbursements, transactions: enriched });
});

// PATCH /joint-account/opening-balance — set the manual starting balance for this workspace.
router.patch("/joint-account/opening-balance", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  const parsed = OpeningBalanceInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Opening balance must be a whole KES amount of zero or more." });
    return;
  }

  const [group] = await db
    .update(groupsTable)
    .set({ bankOpeningBalance: parsed.data.openingBalance })
    .where(eq(groupsTable.id, groupId))
    .returning({ openingBalance: groupsTable.bankOpeningBalance });

  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return;
  }
  res.json(group);
});

// POST /joint-account/deposit
router.post("/joint-account/deposit", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const parsed = DepositInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  if (!requireMemberSelfAttribution(req, res, [parsed.data.madeById])) return;
  if (parsed.data.contributorSplits) {
    for (const split of parsed.data.contributorSplits) {
      if (!requireMemberSelfAttribution(req, res, [split.userId])) return;
      if (split.incomeSourceId) {
        const error = await validateIncomeSourceOwner(split.incomeSourceId, split.userId, groupId);
        if (error) { res.status(400).json({ error }); return; }
      }
    }
  } else if (parsed.data.incomeSourceId) {
    const error = await validateIncomeSourceOwner(parsed.data.incomeSourceId, parsed.data.madeById, groupId);
    if (error) { res.status(400).json({ error }); return; }
  }

  const { amount, description, date, incomeSourceId, sourceKind, contributorSplits } = parsed.data;
  if (sourceKind === "other" && !description.trim()) {
    res.status(400).json({ error: "Add a narration for an Other source." });
    return;
  }
  if (contributorSplits && parsed.data.madeById !== undefined) {
    res.status(400).json({ error: "Provide either madeById or contributorSplits, not both." });
    return;
  }
  if (contributorSplits) {
    const splitTotal = contributorSplits.reduce((sum, split) => sum + split.amount, 0);
    if (splitTotal !== amount) {
      res.status(400).json({ error: `Contributor portions (${splitTotal}) must equal the deposit total (${amount}).` });
      return;
    }
    for (const split of contributorSplits) {
      const err = await validateMemberId(split.userId, groupId);
      if (err) { res.status(400).json({ error: err }); return; }
    }
  }
  // Explicit null or omitted keeps an older un-attributed deposit as a
  // household record. New split deposits must always name their contributors.
  const madeById = parsed.data.madeById ?? null;

  if (madeById !== null) {
    const err = await validateMemberId(madeById, groupId);
    if (err) { res.status(400).json({ error: err }); return; }
  }

  const tx = await db.transaction(async (transaction) => {
    const [created] = await transaction
      .insert(jointAccountTxTable)
      .values({
        groupId,
        type: "deposit", amount, description, date,
        madeById: contributorSplits ? null : madeById,
        incomeSourceId: contributorSplits ? null : incomeSourceId ?? null,
      })
      .returning();
    if (contributorSplits) {
      await transaction.insert(jointAccountDepositSplitsTable).values(contributorSplits.map((split) => ({
        groupId,
        transactionId: created.id,
        userId: split.userId,
        amount: split.amount,
        incomeSourceId: split.incomeSourceId ?? null,
      })));
    }
    return created;
  });

  res.status(201).json(await enrichTx(tx, groupId));
});

// POST /joint-account/disbursement
router.post("/joint-account/disbursement", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

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
    const err = await validateMemberId(madeById, groupId);
    if (err) { res.status(400).json({ error: err }); return; }
  }

  const [category] = await db
    .select({ id: budgetCategoriesTable.id })
    .from(budgetCategoriesTable)
    .where(and(eq(budgetCategoriesTable.name, expenseCategory), eq(budgetCategoriesTable.groupId, groupId)))
    .limit(1);
  if (!category) {
    res.status(400).json({ error: "Choose a valid budget category." });
    return;
  }

  const [tx] = await db
    .insert(jointAccountTxTable)
    .values({
      groupId,
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

  res.status(201).json(await enrichTx(tx, groupId));
});

async function createSavingsTransfer(
  req: Request,
  res: Response,
  direction: "to_savings" | "from_savings",
): Promise<void> {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  const parsed = SavingsTransferInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid transfer details" }); return; }

  const { amount, goalId, narration, date } = parsed.data;
  const madeById = parsed.data.madeById ?? null;
  if (madeById !== null) {
    const err = await validateMemberId(madeById, groupId);
    if (err) { res.status(400).json({ error: err }); return; }
  }

  const result = await db.transaction(async (tx) => {
    const [goal] = await tx
      .select()
      .from(savingsGoalsTable)
      .where(and(eq(savingsGoalsTable.id, goalId), eq(savingsGoalsTable.groupId, groupId)))
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
        groupId,
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
      .where(and(eq(savingsGoalsTable.id, goal.id), eq(savingsGoalsTable.groupId, groupId)));
    await tx.insert(savingsGoalContributionsTable).values({
      groupId,
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
  res.status(201).json(await enrichTx(bankTx, groupId));
}

router.post("/joint-account/transfers/to-savings", async (req, res): Promise<void> => {
  await createSavingsTransfer(req, res, "to_savings");
});

router.post("/joint-account/transfers/from-savings", async (req, res): Promise<void> => {
  await createSavingsTransfer(req, res, "from_savings");
});

// PUT /joint-account/:id — edit a transaction without changing its type.
router.put("/joint-account/:id", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  const params = IdParam.safeParse(req.params);
  const parsed = UpdateJointAccountInput.safeParse(req.body);
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const [existing] = await db
    .select()
    .from(jointAccountTxTable)
    .where(and(eq(jointAccountTxTable.id, params.data.id), eq(jointAccountTxTable.groupId, groupId)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.savingsGoalId !== null) {
    res.status(400).json({ error: "Savings transfers cannot be edited. Delete and recreate the transfer instead." });
    return;
  }
  if (existing.expenseId !== null) {
    res.status(400).json({ error: "This is the Joint-bank portion of an expense. Edit the expense instead." });
    return;
  }
  const existingSplits = await db.select({ id: jointAccountDepositSplitsTable.id })
    .from(jointAccountDepositSplitsTable)
    .where(
      and(
        eq(jointAccountDepositSplitsTable.transactionId, existing.id),
        eq(jointAccountDepositSplitsTable.groupId, groupId),
      ),
    )
    .limit(1);
  if (existingSplits.length > 0) {
    res.status(400).json({ error: "A split deposit cannot be edited. Delete and recreate it to preserve its contributor history." });
    return;
  }

  const { amount, date } = parsed.data;
  const madeById = parsed.data.madeById === undefined ? existing.madeById : parsed.data.madeById;
  if (madeById !== null) {
    const err = await validateMemberId(madeById, groupId);
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
      .where(and(eq(jointAccountTxTable.id, existing.id), eq(jointAccountTxTable.groupId, groupId)))
      .returning();
    res.json(await enrichTx(updated, groupId));
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
    .where(and(eq(budgetCategoriesTable.name, expenseCategory), eq(budgetCategoriesTable.groupId, groupId)))
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
    .where(and(eq(jointAccountTxTable.id, existing.id), eq(jointAccountTxTable.groupId, groupId)))
    .returning();
  res.json(await enrichTx(updated, groupId));
});

// DELETE /joint-account/:id
router.delete("/joint-account/:id", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  const parsed = IdParam.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const deleteResult = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(jointAccountTxTable)
      .where(and(eq(jointAccountTxTable.id, parsed.data.id), eq(jointAccountTxTable.groupId, groupId)))
      .for("update");
    if (!existing) return null;

    if (existing.savingsGoalId !== null) {
      const [goal] = await tx
        .select()
        .from(savingsGoalsTable)
        .where(and(eq(savingsGoalsTable.id, existing.savingsGoalId), eq(savingsGoalsTable.groupId, groupId)))
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
        .where(and(eq(savingsGoalsTable.id, goal.id), eq(savingsGoalsTable.groupId, groupId)));
      await tx
        .delete(savingsGoalContributionsTable)
        .where(
          and(
            eq(savingsGoalContributionsTable.bankTransactionId, existing.id),
            eq(savingsGoalContributionsTable.groupId, groupId),
          ),
        );
    }
    if (existing.expenseId !== null) {
      return { linkedExpense: true };
    }

    const [removed] = await tx
      .delete(jointAccountTxTable)
      .where(and(eq(jointAccountTxTable.id, existing.id), eq(jointAccountTxTable.groupId, groupId)))
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
  if ("linkedExpense" in deleteResult) {
    res.status(409).json({ error: "This is the Joint-bank portion of an expense. Delete the expense instead." });
    return;
  }
  if (!deleteResult.deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ success: true });
});

export default router;
