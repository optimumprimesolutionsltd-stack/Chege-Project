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
  bankAccountsTable,
} from "@workspace/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  getActiveGroupId,
  isGroupManager,
  requireGroupManager,
  requireMemberSelfAttribution,
} from "../lib/activeGroup";

const router = Router();

function currentBusinessDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts();
  const value = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

function isCurrentBusinessDate(value: string | Date | null | undefined): boolean {
  if (!value) return false;
  const date = typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  return date === currentBusinessDate();
}

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
  accountId: z.number().int().positive().optional(),
});

const DisbursementInput = z.object({
  amount: z.number().int().positive(),
  description: z.string().trim().max(200).optional().default(""),
  date: z.string().min(1),
  madeById: z.string().nullable().optional(),
  expenseCategory: z.string().trim().min(1).max(80),
  destinationKind: z.enum(["category", "other"]).optional(),
  accountId: z.number().int().positive().optional(),
});

const BankChargeInput = z.object({
  amount: z.number().int().positive(),
  narration: z.string().trim().min(1).max(200),
  date: z.string().min(1),
  accountId: z.number().int().positive().optional(),
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
  contributorSplits: z.array(z.object({
    userId: z.string().min(1),
    amount: z.number().int().positive(),
    incomeSourceId: z.number().int().positive().nullable().optional(),
  })).optional(),
  transferDirection: z.enum(["to_savings", "from_savings"]).optional(),
  goalId: z.number().int().positive().optional(),
  narration: z.string().trim().min(1).max(200).optional(),
  accountId: z.number().int().positive().optional(),
  bankCharge: z.boolean().optional(),
});

const IdParam = z.object({ id: z.coerce.number().int().positive() });
const OpeningBalanceInput = z.object({
  openingBalance: z.number().int().nonnegative(),
  accountId: z.number().int().positive().optional(),
});
const SavingsTransferInput = z.object({
  amount: z.number().int().positive(),
  goalId: z.number().int().positive(),
  narration: z.string().trim().min(1).max(200),
  date: z.string().min(1),
  madeById: z.string().nullable().optional(),
  accountId: z.number().int().positive().optional(),
});
const AccountInput = z.object({
  name: z.string().trim().min(1).max(80),
  accountNumber: z.string().trim().min(1).max(40).optional(),
  openingBalance: z.number().int().nonnegative().optional(),
});
const AccountUpdateInput = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  accountNumber: z.string().trim().min(1).max(40).nullable().optional(),
  openingBalance: z.number().int().nonnegative().optional(),
}).refine((value) => value.name !== undefined || value.accountNumber !== undefined || value.openingBalance !== undefined, {
  message: "Provide a name, account number, or opening balance.",
});
const AccountQuery = z.object({ accountId: z.coerce.number().int().positive().optional() });

async function resolveAccountId(accountId: number | undefined, groupId: number): Promise<number | null> {
  const accounts = await db.select({ id: bankAccountsTable.id })
    .from(bankAccountsTable)
    .where(accountId === undefined
      ? eq(bankAccountsTable.groupId, groupId)
      : and(eq(bankAccountsTable.id, accountId), eq(bankAccountsTable.groupId, groupId)))
    .orderBy(bankAccountsTable.id)
    .limit(1);
  return accounts[0]?.id ?? null;
}

async function listWorkspaceAccounts(groupId: number) {
  let accounts = await db.select().from(bankAccountsTable)
    .where(eq(bankAccountsTable.groupId, groupId)).orderBy(bankAccountsTable.createdAt);
  if (accounts.length > 0) return accounts;

  await db.insert(bankAccountsTable).values({
    groupId,
    name: "Main account",
    openingBalance: 0,
  }).onConflictDoNothing();

  accounts = await db.select().from(bankAccountsTable)
    .where(eq(bankAccountsTable.groupId, groupId)).orderBy(bankAccountsTable.createdAt);
  const mainAccount = accounts[0];
  if (mainAccount) {
    await db.update(jointAccountTxTable)
      .set({ accountId: mainAccount.id })
      .where(and(
        eq(jointAccountTxTable.groupId, groupId),
        isNull(jointAccountTxTable.accountId),
      ));
  }
  return accounts;
}

async function requireAccountId(accountId: number | undefined, groupId: number, res: Response): Promise<number | null> {
  const resolved = await resolveAccountId(accountId, groupId);
  if (resolved === null) res.status(400).json({ error: "Bank account not found." });
  return resolved;
}

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
    bankCharge: tx.bankCharge ?? false,
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

router.get("/joint-accounts", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const accounts = await listWorkspaceAccounts(groupId);
  res.json(accounts.map((account) => ({
    ...account,
    createdAt: account.createdAt instanceof Date ? account.createdAt.toISOString() : account.createdAt,
  })));
});

router.post("/joint-accounts", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  const parsed = AccountInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid account details." }); return; }
  const [account] = await db.insert(bankAccountsTable).values({
    groupId,
    name: parsed.data.name,
    accountNumber: parsed.data.accountNumber,
    openingBalance: parsed.data.openingBalance ?? 0,
  }).onConflictDoNothing().returning();
  if (!account) { res.status(409).json({ error: "An account with this name already exists." }); return; }
  res.status(201).json({ ...account, createdAt: account.createdAt instanceof Date ? account.createdAt.toISOString() : account.createdAt });
});

router.patch("/joint-accounts/:id", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  const params = IdParam.safeParse(req.params);
  const parsed = AccountUpdateInput.safeParse(req.body);
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid account details." }); return; }
  const [account] = await db.update(bankAccountsTable).set(parsed.data)
    .where(and(eq(bankAccountsTable.id, params.data.id), eq(bankAccountsTable.groupId, groupId))).returning();
  if (!account) { res.status(404).json({ error: "Bank account not found." }); return; }
  res.json({ ...account, createdAt: account.createdAt instanceof Date ? account.createdAt.toISOString() : account.createdAt });
});

router.delete("/joint-accounts/:id", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  const params = IdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid account id." }); return; }
  const accounts = await db.select({ id: bankAccountsTable.id }).from(bankAccountsTable)
    .where(eq(bankAccountsTable.groupId, groupId)).orderBy(bankAccountsTable.id);
  if (accounts.length <= 1) {
    res.status(409).json({ error: "A workspace must keep at least one bank account." });
    return;
  }
  const [linked] = await db.select({ id: jointAccountTxTable.id }).from(jointAccountTxTable)
    .where(and(eq(jointAccountTxTable.accountId, params.data.id), eq(jointAccountTxTable.groupId, groupId))).limit(1);
  if (linked) { res.status(409).json({ error: "An account with transaction history cannot be deleted." }); return; }
  const [deleted] = await db.delete(bankAccountsTable)
    .where(and(eq(bankAccountsTable.id, params.data.id), eq(bankAccountsTable.groupId, groupId))).returning();
  if (!deleted) { res.status(404).json({ error: "Bank account not found." }); return; }
  res.json({ success: true });
});

// With accountId this returns that account. Without it, it preserves legacy
// workspace-wide reporting by aggregating every account.
router.get("/joint-account", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const query = AccountQuery.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid account id." }); return; }
  const accounts = await listWorkspaceAccounts(groupId);
  const selectedAccount = query.data.accountId === undefined
    ? accounts[0]
    : accounts.find((account) => account.id === query.data.accountId);
  if (!selectedAccount) { res.status(400).json({ error: "Bank account not found." }); return; }
  const isAggregate = query.data.accountId === undefined;
  const txs = await db
    .select()
    .from(jointAccountTxTable)
    .where(isAggregate
      ? eq(jointAccountTxTable.groupId, groupId)
      : and(eq(jointAccountTxTable.groupId, groupId), eq(jointAccountTxTable.accountId, selectedAccount.id)))
    .orderBy(sql`${jointAccountTxTable.date} DESC, ${jointAccountTxTable.createdAt} DESC`);

  const enriched = await Promise.all(txs.map((tx) => enrichTx(tx, groupId)));

  const totalDeposits = txs.filter(t => t.type === "deposit").reduce((s, t) => s + t.amount, 0);
  const totalDisbursements = txs.filter(t => t.type === "disbursement").reduce((s, t) => s + t.amount, 0);
  const openingBalance = isAggregate
    ? accounts.reduce((sum, account) => sum + account.openingBalance, 0)
    : selectedAccount.openingBalance;
  const balance = openingBalance + totalDeposits - totalDisbursements;

  res.json({
    accountId: selectedAccount.id,
    accountName: isAggregate ? "All accounts" : selectedAccount.name,
    accountNumber: isAggregate ? null : selectedAccount.accountNumber,
    openingBalance,
    balance,
    closingBalance: balance,
    totalDeposits,
    totalDisbursements,
    transactions: enriched,
  });
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

  const accountId = await requireAccountId(parsed.data.accountId, groupId, res);
  if (accountId === null) return;
  const [group] = await db.update(bankAccountsTable).set({ openingBalance: parsed.data.openingBalance })
    .where(and(eq(bankAccountsTable.id, accountId), eq(bankAccountsTable.groupId, groupId)))
    .returning({ openingBalance: bankAccountsTable.openingBalance });

  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return;
  }
  res.json({ accountId, ...group });
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
  const accountId = await requireAccountId(parsed.data.accountId, groupId, res);
  if (accountId === null) return;

  const tx = await db.transaction(async (transaction) => {
    const [created] = await transaction
      .insert(jointAccountTxTable)
      .values({
        groupId,
        accountId,
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
  if (!requireMemberSelfAttribution(req, res, [parsed.data.madeById])) return;

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
  const accountId = await requireAccountId(parsed.data.accountId, groupId, res);
  if (accountId === null) return;

  const [tx] = await db
    .insert(jointAccountTxTable)
    .values({
      groupId,
      accountId,
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

// POST /joint-account/bank-charge — record a bank fee without classifying it as household spending.
router.post("/joint-account/bank-charge", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  const parsed = BankChargeInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a positive amount, date, and bank-charge narration." });
    return;
  }
  const accountId = await requireAccountId(parsed.data.accountId, groupId, res);
  if (accountId === null) return;

  const [tx] = await db.insert(jointAccountTxTable).values({
    groupId,
    accountId,
    type: "disbursement",
    amount: parsed.data.amount,
    description: parsed.data.narration,
    date: parsed.data.date,
    madeById: null,
    incomeSourceId: null,
    expenseCategory: null,
    bankCharge: true,
  }).returning();

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
  const accountId = await requireAccountId(parsed.data.accountId, groupId, res);
  if (accountId === null) return;
  if (!requireMemberSelfAttribution(req, res, [parsed.data.madeById])) return;

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
        accountId,
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
      accountId,
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

  const params = IdParam.safeParse(req.params);
  const parsed = UpdateJointAccountInput.safeParse(req.body);
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const [existing] = await db
    .select()
    .from(jointAccountTxTable)
    .where(and(eq(jointAccountTxTable.id, params.data.id), eq(jointAccountTxTable.groupId, groupId)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const requestedAccountId = parsed.data.accountId === undefined ? existing.accountId : parsed.data.accountId;
  const accountId = await requireAccountId(requestedAccountId ?? undefined, groupId, res);
  if (accountId === null) return;
  if (existing.bankCharge) {
    if (!requireGroupManager(req, res)) return;
    const narration = parsed.data.description?.trim();
    if (!narration) {
      res.status(400).json({ error: "Bank-charge narration is required." });
      return;
    }
    const [updated] = await db.update(jointAccountTxTable)
      .set({
        type: "disbursement",
        amount: parsed.data.amount,
        description: narration,
        date: parsed.data.date,
        madeById: null,
        incomeSourceId: null,
        expenseCategory: null,
        bankCharge: true,
        accountId,
      })
      .where(and(eq(jointAccountTxTable.id, existing.id), eq(jointAccountTxTable.groupId, groupId)))
      .returning();
    res.json(await enrichTx(updated, groupId));
    return;
  }
  if (parsed.data.bankCharge) {
    res.status(400).json({ error: "Only an existing bank charge can be edited as a bank charge." });
    return;
  }
  const requestedMadeById = parsed.data.madeById === undefined
    ? existing.madeById
    : parsed.data.madeById;
  const requestedAttributions = parsed.data.contributorSplits?.length
    ? parsed.data.contributorSplits.map((split) => split.userId)
    : [requestedMadeById];
  if (!requireMemberSelfAttribution(req, res, requestedAttributions)) return;
  const isMember = !isGroupManager(req);
  if (isMember) {
    if (
      existing.type !== "deposit" ||
      existing.savingsGoalId !== null ||
      existing.expenseId !== null ||
      existing.madeById !== req.user!.id ||
      requestedMadeById !== req.user!.id ||
      !isCurrentBusinessDate(existing.date) ||
      !isCurrentBusinessDate(parsed.data.date)
    ) {
      res.status(403).json({
        error: "Members can edit only their own deposits dated today. Ask an admin to correct an earlier or shared bank record.",
      });
      return;
    }
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
  if (existing.savingsGoalId !== null) {
    if (!requireGroupManager(req, res)) return;
    const direction = parsed.data.transferDirection ?? existing.transferDirection;
    const goalId = parsed.data.goalId ?? existing.savingsGoalId;
    const narration = parsed.data.narration;
    if (
      (direction !== "to_savings" && direction !== "from_savings") ||
      !goalId ||
      !narration
    ) {
      res.status(400).json({ error: "Transfer direction, savings goal, and narration are required." });
      return;
    }
    if (requestedMadeById !== null) {
      const err = await validateMemberId(requestedMadeById, groupId);
      if (err) { res.status(400).json({ error: err }); return; }
    }

    const result = await db.transaction(async (tx) => {
      const [lockedBankTx] = await tx
        .select()
        .from(jointAccountTxTable)
        .where(and(eq(jointAccountTxTable.id, existing.id), eq(jointAccountTxTable.groupId, groupId)))
        .for("update");
      if (!lockedBankTx || lockedBankTx.savingsGoalId === null) {
        return { error: "Transfer not found.", status: 404 as const };
      }
      const [linkedContribution] = await tx
        .select({ id: savingsGoalContributionsTable.id })
        .from(savingsGoalContributionsTable)
        .where(and(
          eq(savingsGoalContributionsTable.bankTransactionId, lockedBankTx.id),
          eq(savingsGoalContributionsTable.groupId, groupId),
        ))
        .for("update");
      if (!linkedContribution) {
        return { error: "This transfer is missing its linked savings history.", status: 409 as const };
      }

      const goalIds = [...new Set([lockedBankTx.savingsGoalId, goalId])].sort((a, b) => a - b);
      const goals = await tx
        .select()
        .from(savingsGoalsTable)
        .where(and(
          eq(savingsGoalsTable.groupId, groupId),
          inArray(savingsGoalsTable.id, goalIds),
        ))
        .orderBy(savingsGoalsTable.id)
        .for("update");
      const oldGoal = goals.find((goal) => goal.id === lockedBankTx.savingsGoalId);
      const newGoal = goals.find((goal) => goal.id === goalId);
      if (!oldGoal || !newGoal) {
        return { error: "Savings goal not found.", status: 404 as const };
      }

      const oldDelta = lockedBankTx.transferDirection === "to_savings"
        ? lockedBankTx.amount
        : -lockedBankTx.amount;
      const newDelta = direction === "to_savings" ? parsed.data.amount : -parsed.data.amount;
      const nextAmounts = new Map(goals.map((goal) => [goal.id, goal.currentAmount]));
      nextAmounts.set(oldGoal.id, (nextAmounts.get(oldGoal.id) ?? 0) - oldDelta);
      const newGoalAmountAfterReversal = nextAmounts.get(newGoal.id) ?? 0;
      nextAmounts.set(newGoal.id, (nextAmounts.get(newGoal.id) ?? 0) + newDelta);

      for (const goal of goals) {
        const nextAmount = nextAmounts.get(goal.id)!;
        if (nextAmount < 0) {
          return { error: `Only KES ${goal.currentAmount} is available in ${goal.name}.`, status: 409 as const };
        }
        if (nextAmount > goal.targetAmount) {
          return { error: `Only KES ${goal.targetAmount - newGoalAmountAfterReversal} can be moved into ${goal.name}.`, status: 400 as const };
        }
      }

      for (const goal of goals) {
        const nextAmount = nextAmounts.get(goal.id)!;
        await tx
          .update(savingsGoalsTable)
          .set({ currentAmount: nextAmount, isCompleted: nextAmount >= goal.targetAmount })
          .where(and(eq(savingsGoalsTable.id, goal.id), eq(savingsGoalsTable.groupId, groupId)));
      }

      const description = direction === "to_savings"
        ? `Transfer to savings — ${narration}`
        : `Transfer from savings — ${narration}`;
      const [updated] = await tx
        .update(jointAccountTxTable)
        .set({
          type: direction === "to_savings" ? "disbursement" : "deposit",
          amount: parsed.data.amount,
          description,
          date: parsed.data.date,
          madeById: requestedMadeById,
          incomeSourceId: null,
          expenseCategory: null,
          savingsGoalId: goalId,
          transferDirection: direction,
          accountId,
        })
        .where(and(eq(jointAccountTxTable.id, lockedBankTx.id), eq(jointAccountTxTable.groupId, groupId)))
        .returning();
      await tx
        .update(savingsGoalContributionsTable)
        .set({
          goalId,
          amount: newDelta,
          note: direction === "to_savings"
            ? `Bank transfer in: ${narration}`
            : `Bank transfer out: ${narration}`,
          accountId,
        })
        .where(and(
          eq(savingsGoalContributionsTable.bankTransactionId, lockedBankTx.id),
          eq(savingsGoalContributionsTable.groupId, groupId),
        ));
      return { updated };
    });

    if (!result.updated) {
      res.status(result.status ?? 409).json({ error: result.error ?? "Could not update transfer." });
      return;
    }
    res.json(await enrichTx(result.updated, groupId));
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
    const contributorSplits = parsed.data.contributorSplits;
    if (contributorSplits && contributorSplits.length > 0) {
      if (!requireGroupManager(req, res)) return;
      if (parsed.data.madeById !== undefined) {
        res.status(400).json({ error: "Provide either madeById or contributorSplits, not both." });
        return;
      }
      if (new Set(contributorSplits.map((split) => split.userId)).size !== contributorSplits.length) {
        res.status(400).json({ error: "Each contributor can appear only once." });
        return;
      }
      const splitTotal = contributorSplits.reduce((sum, split) => sum + split.amount, 0);
      if (splitTotal !== amount) {
        res.status(400).json({ error: `Contributor portions (${splitTotal}) must equal the deposit total (${amount}).` });
        return;
      }
      for (const split of contributorSplits) {
        const memberError = await validateMemberId(split.userId, groupId);
        if (memberError) { res.status(400).json({ error: memberError }); return; }
        if (split.incomeSourceId) {
          const sourceError = await validateIncomeSourceOwner(split.incomeSourceId, split.userId, groupId);
          if (sourceError) { res.status(400).json({ error: sourceError }); return; }
        }
      }
    }
    if (existingSplits.length > 0 && isMember) {
      res.status(403).json({ error: "Only an owner or admin can edit a split deposit." });
      return;
    }
    if (
      existingSplits.length > 0 &&
      contributorSplits === undefined &&
      (
        amount !== existing.amount ||
        parsed.data.madeById !== undefined ||
        parsed.data.incomeSourceId !== undefined
      )
    ) {
      res.status(400).json({
        error: "Include the complete contributor split list when changing a split deposit's amount or attribution.",
      });
      return;
    }
    const hasSplits = !!contributorSplits?.length;
    const incomeSourceId = hasSplits
      ? null
      : parsed.data.incomeSourceId === undefined
      ? existing.incomeSourceId
      : parsed.data.incomeSourceId;
    if (incomeSourceId !== null) {
      const error = await validateIncomeSourceOwner(incomeSourceId, madeById, groupId);
      if (error) { res.status(400).json({ error }); return; }
    }
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(jointAccountTxTable)
        .set({
          amount,
          date,
          madeById: hasSplits ? null : madeById,
          description,
          incomeSourceId,
          expenseCategory: null,
          accountId,
        })
        .where(and(eq(jointAccountTxTable.id, existing.id), eq(jointAccountTxTable.groupId, groupId)))
        .returning();
      if (contributorSplits !== undefined) {
        await tx.delete(jointAccountDepositSplitsTable).where(and(
          eq(jointAccountDepositSplitsTable.transactionId, existing.id),
          eq(jointAccountDepositSplitsTable.groupId, groupId),
        ));
        if (contributorSplits.length > 0) {
          await tx.insert(jointAccountDepositSplitsTable).values(contributorSplits.map((split) => ({
            groupId,
            transactionId: existing.id,
            userId: split.userId,
            amount: split.amount,
            incomeSourceId: split.incomeSourceId ?? null,
          })));
        }
      }
      return row;
    });
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
    .set({ amount, date, madeById: requestedMadeById, description, expenseCategory, accountId })
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
