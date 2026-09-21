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
  groupContributorsTable,
  incomeSourcesTable,
  bankAccountsTable,
  groupsTable,
} from "@workspace/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  getActiveGroupId,
  isGroupManager,
  requireGroupManager,
  requireMemberSelfAttribution,
  requireTransactionEligibility,
} from "../lib/activeGroup";
import { canonicalExpenseCategoryName } from "../lib/categoryNames";
import { headingAmong, postingToHeadingError } from "../lib/category-headings";
import { memberLedgerName } from "../lib/contributor-name";
import { GROUP_ATTRIBUTION } from "../lib/attribution";
import { createBankStatementPdf } from "../lib/bank-statement-pdf";

const router = Router();
/**
 * Amounts may be zero.
 *
 * Editing a posting down to nothing has to be possible without deleting the
 * row: a line on a statement that turned out to be reversed is still a line
 * that happened, and deleting it loses the reconciliation along with it. The
 * opening balance has accepted zero all along, and every other amount now
 * reads the same way.
 */
const NonNegativeBankAmount = z.number().finite().nonnegative().multipleOf(0.01);

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

/**
 * The M-Pesa receipt code a posting came from, when it came from one.
 *
 * Twelve or so characters, letters and digits, as printed on the message.
 * Upper-cased on the way in so the same code typed two ways is one code.
 */
const MpesaReceipt = z.string().trim().min(6).max(20).regex(/^[A-Za-z0-9]+$/).transform((code) => code.toUpperCase());

const DepositInput = z.object({
  amount: NonNegativeBankAmount,
  mpesaReceipt: MpesaReceipt.optional(),
  /**
   * The party this repays, when it repays one. Money you lent coming back is
   * not income — you had it once already — so every figure that counts money
   * in leaves these out. It stays in the ledger, because it really did reach
   * the account.
   */
  settlesContributorId: z.number().int().positive().optional(),
  /**
   * Money borrowed, arriving in the account. The mirror of the field above:
   * a loan paid out to you is not earnings either, so it is left out of every
   * figure that counts money in. Set alongside settlesContributorId when the
   * lender is a recorded party, and on its own when the loan is tracked as a
   * debt category instead.
   */
  isBorrowing: z.boolean().optional(),
  description: z.string().min(1),
  date: z.string().min(1),
  madeById: z.string().nullable().optional(),
  incomeSourceId: z.number().int().positive().optional(),
  sourceKind: z.enum(["income_source", "other"]).optional(),
  // The month this deposit was for, when that is not the month it arrived.
  // Checked as a pair in the route so the message can say what is missing.
  appliesToMonth: z.number().int().min(1).max(12).nullable().optional(),
  appliesToYear: z.number().int().min(2000).max(2200).nullable().optional(),
  // A portion belongs to either an account holder or a contributor recorded
  // by name. Exactly one of the two, checked in the route so the message can
  // say which is wrong rather than dumping a schema error.
  contributorSplits: z.array(z.object({
    userId: z.string().min(1).optional(),
    contributorId: z.number().int().positive().optional(),
    amount: NonNegativeBankAmount,
    incomeSourceId: z.number().int().positive().optional(),
  })).min(1).optional(),
  accountId: z.number().int().positive().optional(),
});

const DisbursementInput = z.object({
  amount: NonNegativeBankAmount,
  mpesaReceipt: MpesaReceipt.optional(),
  description: z.string().trim().max(200).optional().default(""),
  date: z.string().min(1),
  madeById: z.string().nullable().optional(),
  /**
   * Required, except when the money was lent. Lending carries no category
   * because it is not a cost, and every spending total filters on a category
   * being present — which is exactly what keeps a loan out of them.
   */
  expenseCategory: z.string().trim().min(1).max(80).optional(),
  /**
   * Money lent, leaving the account. Not spending: you expect it back, and it
   * is now owed to you. The mirror of isBorrowing on the way in.
   */
  isLending: z.boolean().optional(),
  destinationKind: z.enum(["category", "other"]).optional(),
  accountId: z.number().int().positive().optional(),
}).superRefine((value, ctx) => {
  // A missing category is only ever allowed because the row is a loan. Left
  // to the schema alone, any withdrawal could quietly lose its category and
  // drop out of spending.
  if (!value.isLending && !value.expenseCategory) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["expenseCategory"], message: "Choose a valid budget category." });
  }
});

const UpdateJointAccountInput = z.object({
  amount: NonNegativeBankAmount,
  description: z.string().trim().max(200).optional(),
  date: z.string().min(1),
  madeById: z.string().nullable().optional(),
  incomeSourceId: z.number().int().positive().nullable().optional(),
  expenseCategory: z.string().trim().min(1).max(80).optional(),
  sourceKind: z.enum(["income_source", "other"]).optional(),
  destinationKind: z.enum(["category", "other"]).optional(),
  contributorSplits: z.array(z.object({
    userId: z.string().min(1),
    amount: NonNegativeBankAmount,
    incomeSourceId: z.number().int().positive().nullable().optional(),
  })).optional(),
  transferDirection: z.enum(["to_savings", "from_savings"]).optional(),
  goalId: z.number().int().positive().optional(),
  narration: z.string().trim().min(1).max(200).optional(),
  accountId: z.number().int().positive().optional(),
}).superRefine((value, ctx) => {
  if (value.transferDirection && !Number.isInteger(value.amount)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["amount"],
      message: "Savings-goal transfers must use whole KES amounts.",
    });
  }
});

/**
 * Whether this receipt has already been recorded in this budget.
 *
 * Refused rather than ignored, and the answer says when and for how much, so
 * somebody pasting a message a second time is told what they are looking at
 * instead of being told "no".
 */
async function alreadyRecorded(
  groupId: number,
  receipt: string | undefined,
): Promise<{ error: string; recordedOn: string; amount: number } | null> {
  if (!receipt) return null;
  const [existing] = await db
    .select({ date: jointAccountTxTable.date, amount: jointAccountTxTable.amount, description: jointAccountTxTable.description })
    .from(jointAccountTxTable)
    .where(and(eq(jointAccountTxTable.groupId, groupId), eq(jointAccountTxTable.mpesaReceipt, receipt)))
    .limit(1);
  if (!existing) return null;
  return {
    error: `${receipt} is already recorded, on ${existing.date} as "${existing.description}".`,
    recordedOn: existing.date,
    amount: existing.amount,
  };
}

const IdParam = z.object({ id: z.coerce.number().int().positive() });
const OpeningBalanceInput = z.object({
  openingBalance: NonNegativeBankAmount,
  openingBalanceDate: z.string().date().optional(),
  accountId: z.number().int().positive().optional(),
});
const SavingsTransferInput = z.object({
  amount: z.number().int().nonnegative(),
  goalId: z.number().int().positive(),
  narration: z.string().trim().min(1).max(200),
  date: z.string().min(1),
  madeById: z.string().nullable().optional(),
  accountId: z.number().int().positive().optional(),
});
const BankToBankTransferInput = z.object({
  sourceAccountId: z.number().int().positive(),
  destinationAccountId: z.number().int().positive(),
  amount: NonNegativeBankAmount,
  narration: z.string().trim().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const AccountInput = z.object({
  name: z.string().trim().min(1).max(80),
  accountNumber: z.string().trim().min(1).max(40).optional(),
  openingBalance: NonNegativeBankAmount.optional(),
  openingBalanceDate: z.string().date().optional(),
});
const AccountUpdateInput = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  accountNumber: z.string().trim().min(1).max(40).nullable().optional(),
  openingBalance: NonNegativeBankAmount.optional(),
  openingBalanceDate: z.string().date().optional(),
}).refine((value) => value.name !== undefined || value.accountNumber !== undefined || value.openingBalance !== undefined || value.openingBalanceDate !== undefined, {
  message: "Provide a name, account number, opening balance, or opening balance date.",
});
const AccountQuery = z.object({ accountId: z.coerce.number().int().positive().optional() });

const accountColumns = {
  id: bankAccountsTable.id,
  groupId: bankAccountsTable.groupId,
  name: bankAccountsTable.name,
  accountNumber: bankAccountsTable.accountNumber,
  openingBalance: bankAccountsTable.openingBalance,
  openingBalanceDate: bankAccountsTable.openingBalanceDate,
  createdAt: bankAccountsTable.createdAt,
};

type AccountRecord = Awaited<ReturnType<typeof selectWorkspaceAccounts>>[number];

async function selectWorkspaceAccounts(groupId: number) {
  return db.select(accountColumns).from(bankAccountsTable)
    .where(eq(bankAccountsTable.groupId, groupId)).orderBy(bankAccountsTable.createdAt);
}

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
  return selectWorkspaceAccounts(groupId);
}

function serializeAccount(account: AccountRecord) {
  const createdAt = account.createdAt instanceof Date ? account.createdAt.toISOString() : account.createdAt;
  return {
    ...account,
    openingBalanceDate: account.openingBalanceDate ?? (
      typeof createdAt === "string" ? createdAt.slice(0, 10) : currentBusinessDate()
    ),
    createdAt,
  };
}

function resolveOpeningBalanceDate(account: AccountRecord): string {
  if (account.openingBalanceDate) return account.openingBalanceDate;
  const createdAt = account.createdAt as Date | string | undefined;
  if (createdAt instanceof Date) return createdAt.toISOString().slice(0, 10);
  if (typeof createdAt === "string") return createdAt.slice(0, 10);
  return currentBusinessDate();
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
  const [user, savingsGoal, contributorSplits, bankTransferAccount] = await Promise.all([
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
    tx.bankTransferAccountId
      ? db.query.bankAccountsTable.findFirst({
          where: and(
            eq(bankAccountsTable.id, tx.bankTransferAccountId),
            eq(bankAccountsTable.groupId, groupId),
          ),
        })
      : null,
  ]);
  const madeByName = contributorSplits.length === 1
    ? (contributorSplits[0].userName ?? "Member")
    : contributorSplits.length > 1
      ? `${contributorSplits.length} contributors`
      : (user?.firstName ?? null);
  return {
    ...tx,
    // null madeById = Joint bank (shared household); name resolves to null so UI can show GROUP_ATTRIBUTION
    madeByName,
    expenseCategory: tx.expenseCategory ?? null,
    savingsGoalId: tx.savingsGoalId ?? null,
    savingsGoalName: savingsGoal?.name ?? null,
    transferDirection: tx.transferDirection ?? null,
    bankTransferId: tx.bankTransferId ?? null,
    bankTransferAccountId: tx.bankTransferAccountId ?? null,
    bankTransferAccountName: bankTransferAccount?.name ?? null,
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
  res.json(accounts.map(serializeAccount));
});

router.post("/joint-accounts", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  const parsed = AccountInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid account details." }); return; }
  try {
    const [account] = await db.insert(bankAccountsTable).values({
      groupId,
      name: parsed.data.name,
      accountNumber: parsed.data.accountNumber,
      openingBalance: parsed.data.openingBalance ?? 0,
      openingBalanceDate: parsed.data.openingBalanceDate ?? currentBusinessDate(),
    }).onConflictDoNothing().returning(accountColumns);
    if (!account) { res.status(409).json({ error: "An account with this name already exists." }); return; }
    res.status(201).json(serializeAccount(account));
  } catch (error) {
    req.log.error({ err: error, groupId }, "Could not create bank account");
    res.status(500).json({ error: "Could not create the bank account. Please try again." });
  }
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
  res.json(serializeAccount(account));
});

router.delete("/joint-accounts/:id", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  const params = IdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid account id." }); return; }
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
/**
 * An account statement for a period.
 *
 * Jamvi's own screens list newest first, which is right for entering a day and
 * useless for checking one: a running balance only means anything read
 * downwards from where it started. So this is oldest first, with an opening
 * balance worked out from everything before the period and a closing balance
 * to hold against the bank's own figure.
 */
const StatementQuery = z.object({
  accountId: z.coerce.number().int().positive(),
  from: z.string().date(),
  to: z.string().date(),
});

async function loadBankStatement(groupId: number, accountId: number, from: string, to: string) {
  const accounts = await listWorkspaceAccounts(groupId);
  const account = accounts.find((candidate) => candidate.id === accountId);
  if (!account) return null;

  // Everything before the period, to know where the balance stood when it
  // began. Cheaper than fetching the rows: only the two sums are needed.
  const [before] = await db
    .select({
      deposits: sql<number>`COALESCE(SUM(CASE WHEN ${jointAccountTxTable.type} = 'deposit' THEN ${jointAccountTxTable.amount} ELSE 0 END), 0)`,
      disbursements: sql<number>`COALESCE(SUM(CASE WHEN ${jointAccountTxTable.type} = 'disbursement' THEN ${jointAccountTxTable.amount} ELSE 0 END), 0)`,
    })
    .from(jointAccountTxTable)
    .where(sql`${jointAccountTxTable.groupId} = ${groupId} AND ${jointAccountTxTable.accountId} = ${accountId} AND ${jointAccountTxTable.date} < ${from}`);

  const rows = await db
    .select()
    .from(jointAccountTxTable)
    .where(sql`${jointAccountTxTable.groupId} = ${groupId} AND ${jointAccountTxTable.accountId} = ${accountId} AND ${jointAccountTxTable.date} >= ${from} AND ${jointAccountTxTable.date} <= ${to}`)
    // Oldest first, and by insertion within a day so two postings on one date
    // keep the order they were entered in rather than swapping between loads.
    .orderBy(sql`${jointAccountTxTable.date} ASC, ${jointAccountTxTable.id} ASC`);

  const openingBalance =
    Number(account.openingBalance ?? 0) + Number(before?.deposits ?? 0) - Number(before?.disbursements ?? 0);

  let running = openingBalance;
  let totalIn = 0;
  let totalOut = 0;
  let borrowed = 0;
  let repaidToUs = 0;
  let lent = 0;
  const entries = rows.map((tx) => {
    const isIn = tx.type === "deposit";
    const amount = Number(tx.amount);
    running = isIn ? running + amount : running - amount;
    if (isIn) totalIn += amount;
    else totalOut += amount;
    if (isIn && tx.isBorrowing) borrowed += amount;
    if (isIn && tx.settlesContributorId !== null) repaidToUs += amount;
    if (!isIn && tx.isLending) lent += amount;
    return {
      id: tx.id,
      date: tx.date,
      description: tx.description ?? "",
      detail: tx.expenseCategory ?? (tx.isLending ? "Lent out" : tx.isBorrowing ? "Borrowed" : null),
      moneyIn: isIn ? amount : 0,
      moneyOut: isIn ? 0 : amount,
      balance: Math.round(running * 100) / 100,
    };
  });

  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    accountId,
    accountName: account.name,
    from,
    to,
    openingBalance: round(openingBalance),
    closingBalance: round(running),
    totalIn: round(totalIn),
    totalOut: round(totalOut),
    borrowed: round(borrowed),
    repaidToUs: round(repaidToUs),
    lent: round(lent),
    entries,
  };
}

function statementPeriodLabel(from: string, to: string): string {
  const day = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return iso;
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
  };
  return `${day(from)} to ${day(to)}`;
}

router.get("/joint-account/statement", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const query = StatementQuery.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Give an account and a from and to date." }); return; }
  if (query.data.from > query.data.to) { res.status(400).json({ error: "The period ends before it starts." }); return; }
  const statement = await loadBankStatement(groupId, query.data.accountId, query.data.from, query.data.to);
  if (!statement) { res.status(404).json({ error: "Bank account not found." }); return; }
  res.json(statement);
});

router.get("/joint-account/statement.pdf", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const query = StatementQuery.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Give an account and a from and to date." }); return; }
  if (query.data.from > query.data.to) { res.status(400).json({ error: "The period ends before it starts." }); return; }
  const statement = await loadBankStatement(groupId, query.data.accountId, query.data.from, query.data.to);
  if (!statement) { res.status(404).json({ error: "Bank account not found." }); return; }

  const [group] = await db
    .select({ name: groupsTable.name })
    .from(groupsTable)
    .where(eq(groupsTable.id, groupId))
    .limit(1);

  const pdf = await createBankStatementPdf({
    groupName: group?.name ?? "Jamvi",
    accountName: statement.accountName,
    periodLabel: statementPeriodLabel(statement.from, statement.to),
    openingBalance: statement.openingBalance,
    closingBalance: statement.closingBalance,
    totalIn: statement.totalIn,
    totalOut: statement.totalOut,
    borrowed: statement.borrowed,
    repaidToUs: statement.repaidToUs,
    lent: statement.lent,
    rows: statement.entries,
  });
  const slug = statement.accountName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "account";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="jamvi-statement-${slug}-${statement.from}-to-${statement.to}.pdf"`);
  res.send(pdf);
});

router.get("/joint-account", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const query = AccountQuery.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid account id." }); return; }
  const accounts = await listWorkspaceAccounts(groupId);
  const isAggregate = query.data.accountId === undefined;
  const selectedAccount = query.data.accountId === undefined
    ? accounts[0]
    : accounts.find((account) => account.id === query.data.accountId);
  if (!isAggregate && !selectedAccount) { res.status(400).json({ error: "Bank account not found." }); return; }
  const txs = await db
    .select()
    .from(jointAccountTxTable)
    .where(isAggregate
      ? eq(jointAccountTxTable.groupId, groupId)
      : and(eq(jointAccountTxTable.groupId, groupId), eq(jointAccountTxTable.accountId, selectedAccount!.id)))
    .orderBy(sql`${jointAccountTxTable.date} DESC, ${jointAccountTxTable.createdAt} DESC`);

  const enriched = await Promise.all(txs.map((tx) => enrichTx(tx, groupId)));

  const ledgerDeposits = txs.filter(t => t.type === "deposit").reduce((s, t) => s + t.amount, 0);
  const ledgerDisbursements = txs.filter(t => t.type === "disbursement").reduce((s, t) => s + t.amount, 0);
  const totalDeposits = txs.filter(t => t.type === "deposit" && t.bankTransferId == null).reduce((s, t) => s + t.amount, 0);
  const totalDisbursements = txs.filter(t => t.type === "disbursement" && t.bankTransferId == null).reduce((s, t) => s + t.amount, 0);
  const openingBalance = isAggregate
    ? accounts.reduce((sum, account) => sum + account.openingBalance, 0)
    : selectedAccount!.openingBalance;
  const openingBalanceDate = isAggregate
    ? null
    : resolveOpeningBalanceDate(selectedAccount!);
  const balance = openingBalance + ledgerDeposits - ledgerDisbursements;
  let balanceCursor = balance;
  const transactions = enriched.map((transaction) => {
    const runningBalance = isAggregate ? null : balanceCursor;
    if (!isAggregate) {
      balanceCursor -= transaction.type === "deposit" ? transaction.amount : -transaction.amount;
    }
    return { ...transaction, runningBalance };
  });

  res.json({
    accountId: isAggregate ? null : selectedAccount!.id,
    accountName: isAggregate ? "All accounts" : selectedAccount!.name,
    accountNumber: isAggregate ? null : selectedAccount!.accountNumber,
    openingBalance,
    openingBalanceDate,
    balance,
    closingBalance: balance,
    totalDeposits,
    totalDisbursements,
    transactions,
  });
});

// PATCH /joint-account/opening-balance — set the manual starting balance for this workspace.
router.patch("/joint-account/opening-balance", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  const parsed = OpeningBalanceInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Opening balance must be zero or more, with no more than two decimal places." });
    return;
  }

  const accountId = await requireAccountId(parsed.data.accountId, groupId, res);
  if (accountId === null) return;
  const openingBalanceDate = parsed.data.openingBalanceDate ?? currentBusinessDate();
  const [account] = await db.update(bankAccountsTable).set({
    openingBalance: parsed.data.openingBalance,
    openingBalanceDate,
  })
    .where(and(eq(bankAccountsTable.id, accountId), eq(bankAccountsTable.groupId, groupId)))
    .returning({
      openingBalance: bankAccountsTable.openingBalance,
      openingBalanceDate: bankAccountsTable.openingBalanceDate,
    });

  if (!account) {
    res.status(404).json({ error: "Bank account not found." });
    return;
  }
  res.json({ accountId, ...account });
});

// POST /joint-account/deposit
router.post("/joint-account/deposit", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!await requireTransactionEligibility(req, res)) return;

  const parsed = DepositInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  if (!requireMemberSelfAttribution(req, res, [parsed.data.madeById])) return;
  if (parsed.data.contributorSplits) {
    for (const split of parsed.data.contributorSplits) {
      // A contributorId is a name in this group's ledger, not an account, so
      // there is no member to attribute to and nothing to check here. It is
      // verified below as belonging to this group.
      if (split.userId !== undefined) {
        if (!requireMemberSelfAttribution(req, res, [split.userId])) return;
        if (split.incomeSourceId) {
          const error = await validateIncomeSourceOwner(split.incomeSourceId, split.userId, groupId);
          if (error) { res.status(400).json({ error }); return; }
        }
      }
    }
  } else if (parsed.data.incomeSourceId) {
    const error = await validateIncomeSourceOwner(parsed.data.incomeSourceId, parsed.data.madeById, groupId);
    if (error) { res.status(400).json({ error }); return; }
  }

  const { amount, description, date, incomeSourceId, sourceKind, contributorSplits, settlesContributorId } = parsed.data;
  const isBorrowing = parsed.data.isBorrowing ?? false;
  const receiptClash = await alreadyRecorded(groupId, parsed.data.mpesaReceipt);
  if (receiptClash) { res.status(409).json(receiptClash); return; }
  // Scoped to this group: an id from another group must not be reachable by
  // guessing, and a settlement pointing outside the group would exclude money
  // from income on the word of a stranger.
  if (settlesContributorId !== undefined) {
    const [party] = await db
      .select({ id: groupContributorsTable.id })
      .from(groupContributorsTable)
      .where(and(eq(groupContributorsTable.id, settlesContributorId), eq(groupContributorsTable.groupId, groupId)))
      .limit(1);
    if (!party) {
      res.status(400).json({ error: "That person is not in this budget." });
      return;
    }
  }
  if (sourceKind === "other" && !description.trim()) {
    res.status(400).json({ error: "Add a narration for an Other source." });
    return;
  }
  // The month this was for, when that is not the month it arrived. Both or
  // neither: a month without a year names no period at all.
  const appliesToMonth = parsed.data.appliesToMonth ?? null;
  const appliesToYear = parsed.data.appliesToYear ?? null;
  if ((appliesToMonth === null) !== (appliesToYear === null)) {
    res.status(400).json({ error: "Give both a month and a year for the period this covers, or neither." });
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
      const named = [split.userId, split.contributorId].filter((value) => value !== undefined);
      if (named.length !== 1) {
        res.status(400).json({ error: "Each portion needs exactly one of userId or contributorId." });
        return;
      }
      if (split.userId !== undefined) {
        const err = await validateMemberId(split.userId, groupId);
        if (err) { res.status(400).json({ error: err }); return; }
      } else {
        const [contributor] = await db
          .select({ id: groupContributorsTable.id })
          .from(groupContributorsTable)
          .where(and(
            eq(groupContributorsTable.id, split.contributorId!),
            eq(groupContributorsTable.groupId, groupId),
            isNull(groupContributorsTable.archivedAt),
          ))
          .limit(1);
        if (!contributor) {
          res.status(400).json({ error: "That contributor is not in this group." });
          return;
        }
      }
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
        mpesaReceipt: parsed.data.mpesaReceipt ?? null,
        // The date stays authoritative for the balance: money moves when it
        // moves. Only the obligation follows the period below.
        appliesToMonth,
        appliesToYear,
        madeById: contributorSplits ? null : madeById,
        // Neither a repayment nor a loan has an income source, by definition:
        // the money is not being earned. One is coming back, the other will
        // have to go back.
        incomeSourceId:
          settlesContributorId || isBorrowing ? null : contributorSplits ? null : incomeSourceId ?? null,
        settlesContributorId: settlesContributorId ?? null,
        isBorrowing,
      })
      .returning();
    if (contributorSplits) {
      const rows = [];
      for (const split of contributorSplits) {
        rows.push({
          groupId,
          transactionId: created.id,
          userId: split.userId ?? null,
          // Both forms end up pointing at a contributor, so the grid reads one
          // column instead of guessing which kind of split it is looking at.
          contributorId: split.contributorId
            ?? (split.userId ? await contributorForMember(transaction, groupId, split.userId) : null),
          amount: split.amount,
          incomeSourceId: split.incomeSourceId ?? null,
        });
      }
      await transaction.insert(jointAccountDepositSplitsTable).values(rows);
    }
    return created;
  });

  res.status(201).json(await enrichTx(tx, groupId));
});

/**
 * The contributor row for a member, created if this is the first time money has
 * been recorded for them.
 *
 * Members become contributors lazily rather than all at once, so a group of
 * forty does not acquire forty rows the moment somebody opens the grid. The
 * partial unique index on (group_id, user_id) makes the insert safe to race.
 */
async function contributorForMember(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  groupId: number,
  userId: string,
): Promise<number | null> {
  const [existing] = await tx
    .select({ id: groupContributorsTable.id })
    .from(groupContributorsTable)
    .where(and(eq(groupContributorsTable.groupId, groupId), eq(groupContributorsTable.userId, userId)))
    .limit(1);
  if (existing) return existing.id;

  const [user] = await tx
    .select({
      preferredName: usersTable.preferredName,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  // Both names. Taking only the first one is how most unidentifiable rows got
  // into the ledger - a group with three Johns got three rows reading "John" -
  // and unlike a typed name this one nobody chose to be ambiguous. A deposit
  // must never fail for want of a surname, so an account carrying only one
  // name still gets a row; the sheet marks it for the treasurer to complete.
  const ledgerName = memberLedgerName(user?.preferredName, user?.firstName, user?.lastName);

  const [created] = await tx
    .insert(groupContributorsTable)
    .values({ groupId, userId, name: ledgerName ?? "Member" })
    .onConflictDoNothing()
    .returning({ id: groupContributorsTable.id });
  if (created) return created.id;

  const [raced] = await tx
    .select({ id: groupContributorsTable.id })
    .from(groupContributorsTable)
    .where(and(eq(groupContributorsTable.groupId, groupId), eq(groupContributorsTable.userId, userId)))
    .limit(1);
  return raced?.id ?? null;
}

// POST /joint-account/disbursement
router.post("/joint-account/disbursement", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  if (!await requireTransactionEligibility(req, res)) return;

  const parsed = DisbursementInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  if (!requireMemberSelfAttribution(req, res, [parsed.data.madeById])) return;

  const { amount, description, date, destinationKind } = parsed.data;
  const isLending = parsed.data.isLending ?? false;
  const disbursementClash = await alreadyRecorded(groupId, parsed.data.mpesaReceipt);
  if (disbursementClash) { res.status(409).json(disbursementClash); return; }
  // Lending carries no category, so there is nothing to canonicalise, look up
  // or refuse for being a heading.
  const expenseCategory = isLending ? null : canonicalExpenseCategoryName(parsed.data.expenseCategory ?? "");
  if (isLending && !description.trim()) {
    res.status(400).json({ error: "Say who the money was lent to." });
    return;
  }
  if (destinationKind === "other" && !description.trim()) {
    res.status(400).json({ error: "Add a narration for an Other destination." });
    return;
  }
  // The same rule the expense route enforces. Spending reaches the category
  // totals through both doors, so a heading has to be refused at both — and
  // this is the door M-Pesa parsing will eventually feed.
  const disbursementHeading = expenseCategory === null ? null : await headingAmong(groupId, [expenseCategory]);
  if (disbursementHeading) {
    res.status(400).json({ error: postingToHeadingError(disbursementHeading) });
    return;
  }
  // Explicit null or omitted → Joint bank (null). Never fall back to req.user.
  const madeById = parsed.data.madeById ?? null;

  if (madeById !== null) {
    const err = await validateMemberId(madeById, groupId);
    if (err) { res.status(400).json({ error: err }); return; }
  }

  if (expenseCategory !== null) {
    const [category] = await db
      .select({ id: budgetCategoriesTable.id })
      .from(budgetCategoriesTable)
      .where(and(eq(budgetCategoriesTable.name, expenseCategory), eq(budgetCategoriesTable.groupId, groupId)))
      .limit(1);
    if (!category) {
      res.status(400).json({ error: "Choose a valid budget category." });
      return;
    }
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
      mpesaReceipt: parsed.data.mpesaReceipt ?? null,
      // Description is a supporting note. When omitted, retain a meaningful
      // non-null value while reports remain anchored on expenseCategory.
      description: description || expenseCategory || "Lent out",
      date,
      madeById,
      expenseCategory,
      isLending,
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
  if (!await requireTransactionEligibility(req, res)) return;

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

router.post("/joint-account/transfers/bank-to-bank", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  if (!await requireTransactionEligibility(req, res)) return;

  const parsed = BankToBankTransferInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter two different bank accounts, a positive whole-KES amount, date, and narration." });
    return;
  }
  const { sourceAccountId, destinationAccountId, amount, narration, date } = parsed.data;
  if (sourceAccountId === destinationAccountId) {
    res.status(400).json({ error: "Choose two different bank accounts." });
    return;
  }

  const transferId = randomUUID();
  const result = await db.transaction(async (tx) => {
    const accountIds = [sourceAccountId, destinationAccountId].sort((a, b) => a - b);
    const lockedAccounts = await tx.select().from(bankAccountsTable)
      .where(and(eq(bankAccountsTable.groupId, groupId), inArray(bankAccountsTable.id, accountIds)))
      .orderBy(bankAccountsTable.id)
      .for("update");
    if (lockedAccounts.length !== 2) return null;
    const source = lockedAccounts.find((account) => account.id === sourceAccountId)!;
    const destination = lockedAccounts.find((account) => account.id === destinationAccountId)!;
    const [outgoing, incoming] = await tx.insert(jointAccountTxTable).values([
      {
        groupId, accountId: source.id, type: "disbursement", amount,
        description: narration, date, madeById: null, incomeSourceId: null,
        expenseCategory: null, bankTransferId: transferId,
        bankTransferAccountId: destination.id,
      },
      {
        groupId, accountId: destination.id, type: "deposit", amount,
        description: narration, date, madeById: null, incomeSourceId: null,
        expenseCategory: null, bankTransferId: transferId,
        bankTransferAccountId: source.id,
      },
    ]).returning();
    return { outgoing, incoming };
  });
  if (!result) {
    res.status(400).json({ error: "Both bank accounts must belong to the active workspace." });
    return;
  }
  res.status(201).json({
    transferId,
    outgoing: await enrichTx(result.outgoing, groupId),
    incoming: await enrichTx(result.incoming, groupId),
  });
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
  if (existing.bankTransferId !== null) {
    res.status(409).json({ error: "Bank-to-bank transfers cannot be edited. Delete the transfer pair and record a corrected transfer." });
    return;
  }
  const requestedAccountId = parsed.data.accountId === undefined ? existing.accountId : parsed.data.accountId;
  const accountId = await requireAccountId(requestedAccountId ?? undefined, groupId, res);
  if (accountId === null) return;
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

  const expenseCategory = canonicalExpenseCategoryName(parsed.data.expenseCategory ?? existing.expenseCategory ?? "");
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
  // Editing is a second way onto a heading, and would otherwise undo the check
  // the create path just gained.
  const editHeading = await headingAmong(groupId, [expenseCategory]);
  if (editHeading) {
    res.status(400).json({ error: postingToHeadingError(editHeading) });
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
    if (existing.bankTransferId !== null) {
      const removed = await tx.delete(jointAccountTxTable)
        .where(and(
          eq(jointAccountTxTable.groupId, groupId),
          eq(jointAccountTxTable.bankTransferId, existing.bankTransferId),
        ))
        .returning();
      return { deleted: removed[0] };
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
