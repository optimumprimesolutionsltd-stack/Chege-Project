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
  debtEntryLinksTable,
  incomeSourcesTable,
  bankAccountsTable,
  groupsTable,
  reversalLinksTable,
  importTidyKeptTable,
} from "@workspace/db";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
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
import { reversalLinksReady, soleReversalCandidate } from "../lib/reversal-links";
import { importTidyKeptReady } from "../lib/import-tidy-kept";
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
  /** A plain note against the entry, the same as expenses already have. */
  notes: z.string().trim().max(1000).optional(),
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
  /** A plain note against the entry, the same as expenses already have. */
  notes: z.string().trim().max(1000).optional(),
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
  /**
   * Who the money went to, when it went to a party: somebody you owe being
   * paid, or somebody being lent to.
   *
   * It was not stored at all before, because the balance is offered after
   * saving and applied separately — so reopening a posting could not say who
   * it was for, and the picker sat empty inviting a guess that would move the
   * wrong person's balance.
   *
   * Safe on a disbursement: every figure that filters on this column is
   * scoped to type = 'deposit', where it means a repayment is not income.
   */
  settlesContributorId: z.number().int().positive().optional(),
  /** The posting this bank charge came with, so it can be found again. */
  chargeForTransactionId: z.number().int().positive().optional(),
  destinationKind: z.enum(["category", "other"]).optional(),
  accountId: z.number().int().positive().optional(),
}).superRefine((value, ctx) => {
  // A missing category is only ever allowed because the row is a loan, or a
  // payment to somebody you owe. Paying off a debt is not a new cost when the
  // cost was recorded as the debt was taken on (stock bought on credit), so it
  // may carry none; when it was not, the person paying picks one. Left to the
  // schema alone, any other withdrawal could quietly lose its category and
  // drop out of spending.
  if (!value.isLending && value.settlesContributorId === undefined && !value.expenseCategory) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["expenseCategory"], message: "Choose a valid budget category." });
  }
});

const UpdateJointAccountInput = z.object({
  amount: NonNegativeBankAmount,
  description: z.string().trim().max(200).optional(),
  date: z.string().min(1),
  madeById: z.string().nullable().optional(),
  incomeSourceId: z.number().int().positive().nullable().optional(),
  // Null takes the category off, which only a payment to somebody you owe may do.
  expenseCategory: z.string().trim().min(1).max(80).nullable().optional(),
  // Omitted leaves whoever was recorded alone: an edit that never touches the
  // party must not drop it.
  settlesContributorId: z.number().int().positive().nullable().optional(),
  // Omitted leaves the note as it was; null or empty clears it.
  notes: z.string().trim().max(1000).nullable().optional(),
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
  /** The M-Pesa receipt this came from, so the same message or statement is recognised next time. */
  mpesaReceipt: MpesaReceipt.optional(),
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
  /**
   * A transfer that came from an M-Pesa message or statement carries its receipt
   * on the M-Pesa account's side only, and says which account that is. Both sides
   * cannot hold the same receipt (it is unique in a budget), and one is enough
   * for the same message to be recognised the next time.
   */
  mpesaReceipt: z.string().trim().regex(/^[A-Z0-9]{8,15}$/).optional(),
  mpesaAccountId: z.number().int().positive().optional(),
});
/** Correcting a transfer: the same fields on both halves, so they cannot disagree. */
const BankTransferUpdateInput = z.object({
  amount: NonNegativeBankAmount,
  narration: z.string().trim().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
/**
 * "This was not a transfer": one half stays as an ordinary entry, the other is
 * removed. Money out kept needs the category it was spent on.
 */
const BankTransferUnpairInput = z.object({
  keepTransactionId: z.number().int().positive(),
  expenseCategory: z.string().trim().min(1).max(120).optional(),
});
const TransferIdParam = z.object({ transferId: z.string().uuid() });
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

/**
 * The person or business a debt entry was with. A repayment names them on the
 * row itself; a borrowing or a loan out names them in debt_entry_links. Read
 * defensively: that table is newer than most rows, and a title is never worth
 * failing the list over.
 */
async function debtPartyNameFor(
  tx: typeof jointAccountTxTable.$inferSelect,
  groupId: number,
): Promise<string | null> {
  if (!tx.isBorrowing && !tx.isLending && !tx.settlesContributorId) return null;
  try {
    // The row's own party is the one somebody chose on this posting, and wins.
    // A link written earlier - an M-Pesa import's guess - could name somebody
    // else, and titling the row after it said "Paid to Ujenzi" on a payment
    // the form showed going to Hermda.
    if (tx.settlesContributorId) {
      const [party] = await db
        .select({ name: groupContributorsTable.name })
        .from(groupContributorsTable)
        .where(and(eq(groupContributorsTable.id, tx.settlesContributorId), eq(groupContributorsTable.groupId, groupId)))
        .limit(1);
      if (party) return party.name;
    }
    const [linked] = await db
      .select({ name: groupContributorsTable.name })
      .from(debtEntryLinksTable)
      .innerJoin(groupContributorsTable, eq(groupContributorsTable.id, debtEntryLinksTable.partyId))
      .where(and(eq(debtEntryLinksTable.transactionId, tx.id), eq(debtEntryLinksTable.groupId, groupId)))
      .limit(1);
    return linked?.name ?? null;
  } catch {
    return null;
  }
}

type ReversalLinkRow = typeof reversalLinksTable.$inferSelect;

/** The link this entry is half of, whichever half it is, or null. */
async function reversalLinkFor(transactionId: number, groupId: number): Promise<ReversalLinkRow | null> {
  if (!reversalLinksReady()) return null;
  const [link] = await db
    .select()
    .from(reversalLinksTable)
    .where(and(
      eq(reversalLinksTable.groupId, groupId),
      or(
        eq(reversalLinksTable.reversalTransactionId, transactionId),
        eq(reversalLinksTable.originalTransactionId, transactionId),
      ),
    ))
    .limit(1);
  return link ?? null;
}

/**
 * How the list should show an entry that is half of a reversal. Read
 * defensively, like debtPartyNameFor: a label is never worth failing the list.
 */
async function reversalPairingFor(
  tx: typeof jointAccountTxTable.$inferSelect,
  groupId: number,
): Promise<{ role: "money_back" | "reversed_payment"; otherTransactionId: number; otherDescription: string; otherDate: string } | null> {
  try {
    const link = await reversalLinkFor(tx.id, groupId);
    if (!link) return null;
    const isMoneyBack = link.reversalTransactionId === tx.id;
    const otherId = isMoneyBack ? link.originalTransactionId : link.reversalTransactionId;
    const [other] = await db
      .select({ description: jointAccountTxTable.description, date: jointAccountTxTable.date })
      .from(jointAccountTxTable)
      .where(and(eq(jointAccountTxTable.id, otherId), eq(jointAccountTxTable.groupId, groupId)))
      .limit(1);
    if (!other) return null;
    return {
      role: isMoneyBack ? "money_back" : "reversed_payment",
      otherTransactionId: otherId,
      otherDescription: other.description ?? "",
      otherDate: String(other.date),
    };
  } catch {
    return null;
  }
}

/** A refusal for touching either half of a linked reversal, or null when it is not one. */
async function refuseWhileReversed(transactionId: number, groupId: number): Promise<string | null> {
  const link = await reversalLinkFor(transactionId, groupId);
  if (!link) return null;
  return link.reversalTransactionId === transactionId
    ? "This money back is linked to the payment it reversed. Unlink it first."
    : "This payment was reversed and is linked to its money back. Unlink it first.";
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
  const debtPartyName = await debtPartyNameFor(tx, groupId);
  const reversal = await reversalPairingFor(tx, groupId);
  const madeByName = contributorSplits.length === 1
    ? (contributorSplits[0].userName ?? "Member")
    : contributorSplits.length > 1
      ? `${contributorSplits.length} contributors`
      : (user?.firstName ?? null);
  return {
    ...tx,
    // null madeById = Joint bank (shared household); name resolves to null so UI can show GROUP_ATTRIBUTION
    madeByName,
    notes: tx.notes ?? null,
    expenseCategory: tx.expenseCategory ?? null,
    isLending: tx.isLending ?? false,
    chargeForTransactionId: tx.chargeForTransactionId ?? null,
    isBorrowing: tx.isBorrowing ?? false,
    // Which party a repayment settled. Without it the editor reopens a
    // repayment as ordinary money in, and says so on screen.
    settlesContributorId: tx.settlesContributorId ?? null,
    // Who the money was borrowed from, lent to, or paid back by, so the entry
    // can be titled by them ("Borrowed from KCB") rather than by the bank's text.
    debtPartyName,
    // Half of a reversal: a money-back deposit, or the payment it undid.
    reversal,
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
      detail: tx.expenseCategory ?? (
        tx.isLending ? "Lent out"
          : tx.isBorrowing ? "Borrowed"
            : !isIn && tx.settlesContributorId !== null ? "Debt payment"
              : null
      ),
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

/**
 * Imported M-Pesa entries in one account that an older import filed wrongly,
 * and the one-tap fix. Two things only:
 *  - an M-Pesa charge (kept with its payment, or saved on its own) filed under
 *    anything but M-Pesa charges - the phone could remember a category picked
 *    once for charges ("School fees") and use it in every budget;
 *  - an imported payment recorded as paid by "the group": it was the
 *    importer's own M-Pesa. Per account, so another member's account is never
 *    touched, and only an owner or admin may do it.
 * Fuliza charges are left alone. Nothing else about an entry changes.
 */
async function importTidyTargets(groupId: number, accountId: number) {
  // Entries somebody chose to leave as they are, once the table exists.
  const keptFilter = importTidyKeptReady()
    ? sql`AND NOT EXISTS (SELECT 1 FROM import_tidy_kept kept WHERE kept.transaction_id = tx.id)`
    : sql``;
  const [builtIn] = await db
    .select({ name: budgetCategoriesTable.name })
    .from(budgetCategoriesTable)
    .where(sql`${budgetCategoriesTable.groupId} = ${groupId} AND lower(btrim(${budgetCategoriesTable.name})) = 'm-pesa charges'`)
    .limit(1);
  const charges = builtIn
    ? await db.execute(sql`
        SELECT tx.id, tx.amount::float8 AS amount, tx.description, tx.date::text AS date
        FROM joint_account_transactions tx
        LEFT JOIN joint_account_transactions parent ON parent.id = tx.charge_for_transaction_id AND parent.group_id = tx.group_id
        WHERE tx.group_id = ${groupId}
          AND tx.account_id = ${accountId}
          AND tx.type = 'disbursement'
          AND tx.expense_category IS NOT NULL
          AND lower(btrim(tx.expense_category)) NOT IN ('m-pesa charges', 'fuliza charges')
          ${keptFilter}
          AND (
            (tx.charge_for_transaction_id IS NOT NULL AND parent.mpesa_receipt IS NOT NULL)
            OR (tx.mpesa_receipt ~ '^[A-Z0-9]{8,12}C[0-9]+$')
          )
      `).then((result) => result.rows as Array<{ id: number; amount: number; description: string | null; date: string }>)
    : [];
  const unpaid = await db.execute(sql`
    SELECT tx.id
    FROM joint_account_transactions tx
    LEFT JOIN joint_account_transactions parent ON parent.id = tx.charge_for_transaction_id AND parent.group_id = tx.group_id
    WHERE tx.group_id = ${groupId}
      AND tx.account_id = ${accountId}
      AND tx.type = 'disbursement'
      AND tx.made_by_id IS NULL
      AND tx.bank_transfer_id IS NULL
      ${keptFilter}
      AND (tx.mpesa_receipt IS NOT NULL OR parent.mpesa_receipt IS NOT NULL)
  `).then((result) => (result.rows as Array<{ id: number }>).map((row) => Number(row.id)));
  return { chargeCategory: builtIn?.name ?? null, charges, unpaid };
}

const TidyQuery = z.object({ accountId: z.coerce.number().int().positive() });
// Only these entries, when given: the ones the person was shown and did not
// choose to leave as they are. Left out, everything found (older phones).
const TidyBody = TidyQuery.extend({ ids: z.array(z.number().int().positive()).max(5_000).optional() });

router.get("/joint-account/import-tidy", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const query = TidyQuery.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Choose an account." }); return; }
  const { chargeCategory, charges, unpaid } = await importTidyTargets(groupId, query.data.accountId);
  res.json({
    chargeCategory,
    charges: charges.length,
    chargesAmount: Math.round(charges.reduce((sum, row) => sum + Number(row.amount), 0) * 100) / 100,
    payer: unpaid.length,
    // Each one by id, so the phone can name them and leave some as they are.
    chargeRows: charges.map((row) => ({ id: Number(row.id), amount: Number(row.amount), description: row.description ?? "", date: String(row.date).slice(0, 10) })),
    payerIds: unpaid,
  });
});

router.post("/joint-account/import-tidy", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  const query = TidyBody.safeParse(req.body ?? {});
  if (!query.success) { res.status(400).json({ error: "Choose an account." }); return; }
  const found = await importTidyTargets(groupId, query.data.accountId);
  const only = query.data.ids ? new Set(query.data.ids) : null;
  const chargeCategory = found.chargeCategory;
  const charges = only ? found.charges.filter((row) => only.has(Number(row.id))) : found.charges;
  const unpaid = only ? found.unpaid.filter((id) => only.has(id)) : found.unpaid;
  await db.transaction(async (trx) => {
    if (chargeCategory && charges.length > 0) {
      await trx.update(jointAccountTxTable)
        .set({ expenseCategory: chargeCategory })
        .where(and(eq(jointAccountTxTable.groupId, groupId), inArray(jointAccountTxTable.id, charges.map((row) => Number(row.id)))));
    }
    if (unpaid.length > 0) {
      await trx.update(jointAccountTxTable)
        .set({ madeById: req.user!.id })
        .where(and(eq(jointAccountTxTable.groupId, groupId), inArray(jointAccountTxTable.id, unpaid)));
    }
  });
  res.json({ charges: chargeCategory ? charges.length : 0, payer: unpaid.length });
});

/**
 * Leave these as they are: never offered by the tidy again, on any device.
 * Only entries the tidy would offer in this account are recorded, so nothing
 * else can be marked through here. 503 until the table exists, and the phone
 * then remembers on the device instead.
 */
router.post("/joint-account/import-tidy/keep", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  const body = TidyBody.safeParse(req.body ?? {});
  if (!body.success || !body.data.ids || body.data.ids.length === 0) { res.status(400).json({ error: "Choose the entries to leave as they are." }); return; }
  if (!importTidyKeptReady()) { res.status(503).json({ error: "This cannot be kept yet. Try again in a minute." }); return; }
  const found = await importTidyTargets(groupId, body.data.accountId);
  const offered = new Set([...found.charges.map((row) => Number(row.id)), ...found.unpaid]);
  const ids = body.data.ids.filter((id) => offered.has(id));
  if (ids.length > 0) {
    await db.insert(importTidyKeptTable)
      .values(ids.map((transactionId) => ({ transactionId, groupId })))
      .onConflictDoNothing();
  }
  res.json({ kept: ids.length });
});

router.get("/joint-account/statement.pdf", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  // Owners and admins only: see /dashboard/monthly-report.pdf.
  if (!requireGroupManager(req, res)) return;
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

  // Everything, or only money in or only money out. The balance column is
  // the account's own after each entry, so it stays true either way.
  const showing = req.query.show === "in" || req.query.show === "out" ? req.query.show : "all";
  const rows = showing === "all"
    ? statement.entries
    : statement.entries.filter((entry) => (showing === "in" ? entry.moneyIn > 0 : entry.moneyOut > 0));

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
    rows,
    showing,
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

  // The balance is as at today (Kenyan date). An entry dated in the future has
  // not happened yet, so it is listed but not counted - the headline used to
  // add everything, so a posting dated next week already moved today's balance.
  const today = currentBusinessDate();
  const dayOf = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const happened = txs.filter(t => dayOf(t.date) <= today);
  const ledgerDeposits = happened.filter(t => t.type === "deposit").reduce((s, t) => s + t.amount, 0);
  const ledgerDisbursements = happened.filter(t => t.type === "disbursement").reduce((s, t) => s + t.amount, 0);
  const totalDeposits = happened.filter(t => t.type === "deposit" && t.bankTransferId == null).reduce((s, t) => s + t.amount, 0);
  const totalDisbursements = happened.filter(t => t.type === "disbursement" && t.bankTransferId == null).reduce((s, t) => s + t.amount, 0);
  // Every entry, future ones included: the running balance on each row walks
  // the whole ledger, and the first row dated today or earlier lands exactly
  // on the balance above.
  const fullDeposits = txs.filter(t => t.type === "deposit").reduce((s, t) => s + t.amount, 0);
  const fullDisbursements = txs.filter(t => t.type === "disbursement").reduce((s, t) => s + t.amount, 0);
  const openingBalance = isAggregate
    ? accounts.reduce((sum, account) => sum + account.openingBalance, 0)
    : selectedAccount!.openingBalance;
  const openingBalanceDate = isAggregate
    ? null
    : resolveOpeningBalanceDate(selectedAccount!);
  const balance = openingBalance + ledgerDeposits - ledgerDisbursements;
  let balanceCursor = openingBalance + fullDeposits - fullDisbursements;
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
        notes: parsed.data.notes?.trim() || null,
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
  const paidPartyId = parsed.data.settlesContributorId;
  if (paidPartyId !== undefined) {
    // Scoped to this group, like the deposit side: an id from another budget
    // must not be reachable by guessing.
    const [party] = await db
      .select({ id: groupContributorsTable.id })
      .from(groupContributorsTable)
      .where(and(eq(groupContributorsTable.id, paidPartyId), eq(groupContributorsTable.groupId, groupId)))
      .limit(1);
    if (!party) {
      res.status(400).json({ error: "That person is not in this budget." });
      return;
    }
  }
  const chargeParentId = parsed.data.chargeForTransactionId;
  if (chargeParentId !== undefined) {
    // Scoped to this group, and refused if it is itself a charge: a fee on a
    // fee is not a thing, and a chain of them would have no parent to show.
    const [parent] = await db
      .select({ id: jointAccountTxTable.id, chargeFor: jointAccountTxTable.chargeForTransactionId })
      .from(jointAccountTxTable)
      .where(and(eq(jointAccountTxTable.id, chargeParentId), eq(jointAccountTxTable.groupId, groupId)))
      .limit(1);
    if (!parent || parent.chargeFor !== null) {
      res.status(400).json({ error: "That posting is not one a charge can belong to." });
      return;
    }
  }
  const disbursementClash = await alreadyRecorded(groupId, parsed.data.mpesaReceipt);
  if (disbursementClash) { res.status(409).json(disbursementClash); return; }
  // Lending carries no category, nor does a debt payment given none, so there
  // is nothing to canonicalise, look up or refuse for being a heading.
  const expenseCategory = isLending || !parsed.data.expenseCategory
    ? null
    : canonicalExpenseCategoryName(parsed.data.expenseCategory);
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
      description: description || expenseCategory || (isLending ? "Lent out" : "Debt payment"),
      notes: parsed.data.notes?.trim() || null,
      date,
      madeById,
      expenseCategory,
      isLending,
      settlesContributorId: paidPartyId ?? null,
      chargeForTransactionId: chargeParentId ?? null,
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
  const savingsClash = await alreadyRecorded(groupId, parsed.data.mpesaReceipt);
  if (savingsClash) { res.status(409).json(savingsClash); return; }
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
        mpesaReceipt: parsed.data.mpesaReceipt ?? null,
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
  const { sourceAccountId, destinationAccountId, amount, narration, date, mpesaReceipt, mpesaAccountId } = parsed.data;
  if (sourceAccountId === destinationAccountId) {
    res.status(400).json({ error: "Choose two different bank accounts." });
    return;
  }
  if (mpesaReceipt) {
    if (mpesaAccountId !== sourceAccountId && mpesaAccountId !== destinationAccountId) {
      res.status(400).json({ error: "Say which of the two accounts the M-Pesa receipt belongs to." });
      return;
    }
    const clash = await alreadyRecorded(groupId, mpesaReceipt);
    if (clash) { res.status(409).json(clash); return; }
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
        mpesaReceipt: mpesaReceipt && mpesaAccountId === source.id ? mpesaReceipt : null,
      },
      {
        groupId, accountId: destination.id, type: "deposit", amount,
        description: narration, date, madeById: null, incomeSourceId: null,
        expenseCategory: null, bankTransferId: transferId,
        bankTransferAccountId: source.id,
        mpesaReceipt: mpesaReceipt && mpesaAccountId === destination.id ? mpesaReceipt : null,
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

// PUT /joint-account/transfers/bank-to-bank/:transferId — correct both halves together.
router.put("/joint-account/transfers/bank-to-bank/:transferId", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  if (!await requireTransactionEligibility(req, res)) return;

  const params = TransferIdParam.safeParse(req.params);
  const parsed = BankTransferUpdateInput.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Enter a positive amount, a date, and a narration." });
    return;
  }
  const { amount, narration, date } = parsed.data;
  const rows = await db.transaction(async (tx) => {
    const pair = await tx.select().from(jointAccountTxTable)
      .where(and(eq(jointAccountTxTable.groupId, groupId), eq(jointAccountTxTable.bankTransferId, params.data.transferId)))
      .for("update");
    if (pair.length !== 2) return null;
    return tx.update(jointAccountTxTable)
      .set({ amount, description: narration, date })
      .where(and(eq(jointAccountTxTable.groupId, groupId), eq(jointAccountTxTable.bankTransferId, params.data.transferId)))
      .returning();
  });
  if (!rows) {
    res.status(404).json({ error: "Transfer not found." });
    return;
  }
  const outgoing = rows.find((row) => row.type === "disbursement")!;
  const incoming = rows.find((row) => row.type === "deposit")!;
  res.json({
    transferId: params.data.transferId,
    outgoing: await enrichTx(outgoing, groupId),
    incoming: await enrichTx(incoming, groupId),
  });
});

// POST /joint-account/transfers/bank-to-bank/:transferId/unpair — it was not a
// transfer after all (an M-Pesa payment to a company, filed as a move to a bank).
router.post("/joint-account/transfers/bank-to-bank/:transferId/unpair", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  if (!await requireTransactionEligibility(req, res)) return;

  const params = TransferIdParam.safeParse(req.params);
  const parsed = BankTransferUnpairInput.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Say which half to keep." });
    return;
  }
  const { keepTransactionId, expenseCategory } = parsed.data;
  if (expenseCategory) {
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
  const result = await db.transaction(async (tx) => {
    const pair = await tx.select().from(jointAccountTxTable)
      .where(and(eq(jointAccountTxTable.groupId, groupId), eq(jointAccountTxTable.bankTransferId, params.data.transferId)))
      .for("update");
    const kept = pair.find((row) => row.id === keepTransactionId);
    const other = pair.find((row) => row.id !== keepTransactionId);
    if (pair.length !== 2 || !kept || !other) return { error: "Transfer not found.", status: 404 as const };
    // Money out is spending once it is no longer a move, and spending has a category.
    if (kept.type === "disbursement" && !expenseCategory) {
      return { error: "Choose the category this payment was for.", status: 400 as const };
    }
    await tx.delete(jointAccountTxTable)
      .where(and(eq(jointAccountTxTable.id, other.id), eq(jointAccountTxTable.groupId, groupId)));
    const [updated] = await tx.update(jointAccountTxTable)
      .set({
        bankTransferId: null,
        bankTransferAccountId: null,
        ...(kept.type === "disbursement" ? { expenseCategory } : {}),
      })
      .where(and(eq(jointAccountTxTable.id, kept.id), eq(jointAccountTxTable.groupId, groupId)))
      .returning();
    return { updated };
  });
  if (!("updated" in result) || !result.updated) {
    res.status(result.status ?? 400).json({ error: result.error ?? "Could not change the transfer." });
    return;
  }
  res.json(await enrichTx(result.updated, groupId));
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
    res.status(409).json({ error: "Edit a bank-to-bank transfer as a transfer, so both halves change together." });
    return;
  }
  // Editing either half could give the payment its category back, or change an
  // amount the link was made on, while it still claims to be cancelled out.
  const reversedEdit = await refuseWhileReversed(existing.id, groupId);
  if (reversedEdit) { res.status(409).json({ error: reversedEdit }); return; }
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
          ...(parsed.data.notes === undefined ? {} : { notes: parsed.data.notes?.trim() || null }),
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
          ...(parsed.data.notes === undefined ? {} : { notes: parsed.data.notes?.trim() || null }),
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
    await debtLinkFollowsParty(updated.id, groupId, updated.settlesContributorId);
    res.json(await enrichTx(updated, groupId));
    return;
  }

  // A loan out has no category, by design — that absence is what keeps it out
  // of every spending total. The create path knows this; the update path did
  // not, so editing one demanded a category it must never have and refused
  // the edit when none came. The row itself is the authority: an edit cannot
  // turn ordinary spending into a loan, or the reverse, by omission.
  const editingALoanOut = existing.isLending === true;
  // A payment to somebody you owe may carry no category (see DisbursementInput),
  // and an edit may take one off - null clears it - but only while the row is
  // still paying somebody. Everything else keeps needing a category.
  const paysAParty = (parsed.data.settlesContributorId === undefined
    ? existing.settlesContributorId
    : parsed.data.settlesContributorId) != null;
  const categoryAsked = parsed.data.expenseCategory === null
    ? ""
    : parsed.data.expenseCategory ?? existing.expenseCategory ?? "";
  const expenseCategory = editingALoanOut || (paysAParty && !categoryAsked)
    ? null
    : canonicalExpenseCategoryName(categoryAsked);
  if (!editingALoanOut && !paysAParty && !expenseCategory) {
    res.status(400).json({ error: "Choose a valid budget category." });
    return;
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
  // Editing is a second way onto a heading, and would otherwise undo the check
  // the create path just gained.
  const editHeading = expenseCategory === null ? null : await headingAmong(groupId, [expenseCategory]);
  if (editHeading) {
    res.status(400).json({ error: postingToHeadingError(editHeading) });
    return;
  }

  const description = parsed.data.description === undefined
    ? existing.description
    // A loan out has no category to fall back on, so what is already there
    // stands rather than being replaced with nothing.
    : parsed.data.description || expenseCategory || existing.description;
  if (parsed.data.destinationKind === "other" && !description.trim()) {
    res.status(400).json({ error: "Add a narration for an Other destination." });
    return;
  }
  const [updated] = await db
    .update(jointAccountTxTable)
    .set({
      amount,
      date,
      madeById: requestedMadeById,
      description,
      expenseCategory,
      accountId,
      ...(parsed.data.settlesContributorId === undefined
        ? {}
        : { settlesContributorId: parsed.data.settlesContributorId }),
      ...(parsed.data.notes === undefined ? {} : { notes: parsed.data.notes?.trim() || null }),
    })
    .where(and(eq(jointAccountTxTable.id, existing.id), eq(jointAccountTxTable.groupId, groupId)))
    .returning();
  await debtLinkFollowsParty(updated.id, groupId, updated.settlesContributorId);
  res.json(await enrichTx(updated, groupId));
});

/**
 * Point a posting's debt link at the party the posting now names.
 *
 * The link records whose balance an entry changed, and is read when the entry
 * is deleted to put that change back. Choosing a different payee on an edit
 * left it naming the old one - an M-Pesa import's "paying back Ujenzi" stayed
 * on a payment since set to Hermda - so deleting it would have given the money
 * back to the wrong party. The kind is kept: it is still the same sort of
 * entry. Balances are not moved here; that stays a choice the person makes.
 */
async function debtLinkFollowsParty(transactionId: number, groupId: number, partyId: number | null): Promise<void> {
  if (partyId === null) return;
  await db
    .update(debtEntryLinksTable)
    .set({ partyId })
    .where(and(
      eq(debtEntryLinksTable.transactionId, transactionId),
      eq(debtEntryLinksTable.groupId, groupId),
      ne(debtEntryLinksTable.partyId, partyId),
    ));
}

// ── Reversals ────────────────────────────────────────────────────────────────
// A money-back deposit linked to the payment it undid. Linked, neither counts:
// the deposit is left out of income (see lib/reversal-links.ts) and the payment
// out of spending, by having its category set aside in the link. See 0047.

const REVERSAL_WINDOW_DAYS = 60;

type TxRow = typeof jointAccountTxTable.$inferSelect;

const sameAmount = (a: unknown, b: unknown) => Math.round(Number(a) * 100) === Math.round(Number(b) * 100);

/** Why this deposit cannot be a money-back at all, or null when it can. */
function notAMoneyBack(tx: TxRow): string | null {
  if (tx.type !== "deposit") return "Only money coming in can be a reversal.";
  if (tx.bankTransferId !== null || tx.savingsGoalId !== null || tx.transferDirection !== null) {
    return "A transfer between your own accounts or savings is not a reversal.";
  }
  if (tx.isBorrowing || tx.settlesContributorId !== null) {
    return "Borrowed money, or money paid back to you, is not a reversal.";
  }
  return null;
}

/** Why this payment cannot be the one reversed, or null when it can. */
function notReversible(tx: TxRow): string | null {
  if (tx.type !== "disbursement") return "Only a payment can be reversed.";
  if (tx.bankTransferId !== null || tx.savingsGoalId !== null || tx.transferDirection !== null) {
    return "A transfer between your own accounts or savings cannot be reversed here.";
  }
  if (tx.expenseId !== null) return "This payment belongs to an expense. Edit or delete the expense instead.";
  return null;
}

async function reversalOptions(deposit: TxRow, groupId: number) {
  if (!reversalLinksReady()) return { available: false, linked: null, candidates: [] };
  const toCandidate = (row: TxRow & { accountName?: string | null }) => ({
    id: row.id,
    date: String(row.date),
    description: row.description ?? "",
    amount: Number(row.amount),
    expenseCategory: row.expenseCategory ?? null,
    accountName: row.accountName ?? null,
  });

  const link = await reversalLinkFor(deposit.id, groupId);
  if (link && link.reversalTransactionId === deposit.id) {
    const [original] = await db
      .select({ tx: jointAccountTxTable, accountName: bankAccountsTable.name })
      .from(jointAccountTxTable)
      .leftJoin(bankAccountsTable, eq(bankAccountsTable.id, jointAccountTxTable.accountId))
      .where(and(eq(jointAccountTxTable.id, link.originalTransactionId), eq(jointAccountTxTable.groupId, groupId)))
      .limit(1);
    return {
      available: true,
      // Shown with the category it will get back, not the empty one it has while linked.
      linked: original ? { ...toCandidate({ ...original.tx, accountName: original.accountName }), expenseCategory: link.originalCategory } : null,
      candidates: [],
    };
  }
  if (link || notAMoneyBack(deposit)) return { available: true, linked: null, candidates: [] };
  const rows = await reversalCandidates(deposit, groupId);
  return {
    available: true,
    linked: null,
    candidates: rows.map((row) => toCandidate({ ...row.tx, accountName: row.accountName })),
  };
}

/**
 * The payments a money-back deposit could have reversed: same budget, same
 * amount, on or up to 60 days before it, an ordinary payment, and not already
 * reversed by anything.
 */
async function reversalCandidates(deposit: TxRow, groupId: number) {
  // The window's first day, worked out here. Written in SQL as date - $param,
  // Postgres read the untyped 60 as a date and every match failed with a 500.
  const windowStart = new Date(`${String(deposit.date).slice(0, 10)}T00:00:00Z`);
  windowStart.setUTCDate(windowStart.getUTCDate() - REVERSAL_WINDOW_DAYS);
  const fromDay = windowStart.toISOString().slice(0, 10);
  return db
    .select({ tx: jointAccountTxTable, accountName: bankAccountsTable.name })
    .from(jointAccountTxTable)
    .leftJoin(bankAccountsTable, eq(bankAccountsTable.id, jointAccountTxTable.accountId))
    .where(sql`${jointAccountTxTable.groupId} = ${groupId}
      AND ${jointAccountTxTable.type} = 'disbursement'
      AND ${jointAccountTxTable.amount} = ${deposit.amount}
      AND ${jointAccountTxTable.bankTransferId} IS NULL
      AND ${jointAccountTxTable.savingsGoalId} IS NULL
      AND ${jointAccountTxTable.transferDirection} IS NULL
      AND ${jointAccountTxTable.expenseId} IS NULL
      AND ${jointAccountTxTable.date} <= ${deposit.date}
      AND ${jointAccountTxTable.date} >= ${fromDay}
      AND NOT EXISTS (SELECT 1 FROM reversal_links rl WHERE rl.original_transaction_id = ${jointAccountTxTable.id})`)
    .orderBy(sql`${jointAccountTxTable.date} DESC, ${jointAccountTxTable.id} DESC`)
    .limit(10);
}

/**
 * Link a money-back deposit to the payment it reversed, or say why not. The
 * one place a link is made, by hand or by matching: the same checks, and the
 * link and the payment's category set aside together - a link without that
 * would leave the payment counted as spending while the money back had
 * stopped counting as income.
 */
async function linkReversal(deposit: TxRow, original: TxRow, groupId: number): Promise<{ status: 400 | 409; error: string } | null> {
  const problem = notAMoneyBack(deposit) ?? notReversible(original)
    ?? (!sameAmount(deposit.amount, original.amount) ? "A reversal gives back exactly what was paid. These amounts differ." : null)
    ?? (String(original.date) > String(deposit.date) ? "Money cannot come back before it was paid." : null);
  if (problem) return { status: 400, error: problem };
  if (await reversalLinkFor(deposit.id, groupId) || await reversalLinkFor(original.id, groupId)) {
    return { status: 409, error: "One of these is already part of a reversal." };
  }
  await db.transaction(async (trx) => {
    await trx.insert(reversalLinksTable).values({
      reversalTransactionId: deposit.id,
      originalTransactionId: original.id,
      groupId,
      originalCategory: original.expenseCategory,
    });
    await trx
      .update(jointAccountTxTable)
      .set({ expenseCategory: null })
      .where(and(eq(jointAccountTxTable.id, original.id), eq(jointAccountTxTable.groupId, groupId)));
  });
  return null;
}

async function loadTx(id: number, groupId: number): Promise<TxRow | null> {
  const [row] = await db
    .select()
    .from(jointAccountTxTable)
    .where(and(eq(jointAccountTxTable.id, id), eq(jointAccountTxTable.groupId, groupId)))
    .limit(1);
  return row ?? null;
}

// GET /joint-account/:id/reversal — what this deposit reverses, or could.
router.get("/joint-account/:id/reversal", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const params = IdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const deposit = await loadTx(params.data.id, groupId);
  if (!deposit) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await reversalOptions(deposit, groupId));
});

// POST /joint-account/:id/reversal — link this deposit to the payment it reversed.
router.post("/joint-account/:id/reversal", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  const params = IdParam.safeParse(req.params);
  const body = z.object({ originalTransactionId: z.number().int().positive() }).safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid input" }); return; }
  if (!reversalLinksReady()) {
    res.status(503).json({ error: "Reversals are not available yet. Try again in a minute." });
    return;
  }

  const [deposit, original] = await Promise.all([
    loadTx(params.data.id, groupId),
    loadTx(body.data.originalTransactionId, groupId),
  ]);
  if (!deposit || !original) { res.status(404).json({ error: "Not found" }); return; }
  const refused = await linkReversal(deposit, original, groupId);
  if (refused) { res.status(refused.status).json({ error: refused.error }); return; }
  res.json(await reversalOptions(deposit, groupId));
});

// POST /joint-account/reversals/auto-link — match every money-back entry
// that has exactly one payment it could have reversed (or one made twice).
//
// Linking by hand left every reversal counting as income until somebody
// opened it. Most have one obvious match - the only payment of exactly that
// amount in the 60 days before - and those are linked here, oldest first, so
// two money-backs can never claim the same payment. The rest, with several
// possible payments or none, are listed for the person to settle.
router.post("/joint-account/reversals/auto-link", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  if (!reversalLinksReady()) {
    res.json({ linked: 0, needsYou: [] });
    return;
  }
  // Money-back entries are the deposits an import files as a reversal.
  const deposits = await db
    .select()
    .from(jointAccountTxTable)
    .where(sql`${jointAccountTxTable.groupId} = ${groupId}
      AND ${jointAccountTxTable.type} = 'deposit'
      AND ${jointAccountTxTable.description} ILIKE 'Money back%'
      AND NOT EXISTS (SELECT 1 FROM reversal_links rl WHERE rl.reversal_transaction_id = ${jointAccountTxTable.id})`)
    .orderBy(sql`${jointAccountTxTable.date} ASC, ${jointAccountTxTable.id} ASC`)
    .limit(200);

  let linked = 0;
  const needsYou: Array<{ id: number; description: string; amount: number; date: string; candidates: number }> = [];
  for (const deposit of deposits) {
    if (notAMoneyBack(deposit)) continue;
    const candidates = await reversalCandidates(deposit, groupId);
    // One payment, or the same payment made twice that day (see soleReversalCandidate).
    const sole = soleReversalCandidate(candidates, String(deposit.date));
    if (sole) {
      const refused = await linkReversal(deposit, sole.tx, groupId);
      if (!refused) {
        linked += 1;
        continue;
      }
    }
    needsYou.push({
      id: deposit.id,
      description: deposit.description ?? "",
      amount: Number(deposit.amount),
      date: String(deposit.date),
      candidates: candidates.length,
    });
  }
  res.json({ linked, needsYou });
});

// DELETE /joint-account/:id/reversal — put both entries back as they were.
router.delete("/joint-account/:id/reversal", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  const params = IdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const link = await reversalLinkFor(params.data.id, groupId);
  if (link) {
    await db.transaction(async (trx) => {
      // Only if still empty: nothing since has given it a category of its own.
      await trx
        .update(jointAccountTxTable)
        .set({ expenseCategory: link.originalCategory })
        .where(and(
          eq(jointAccountTxTable.id, link.originalTransactionId),
          eq(jointAccountTxTable.groupId, groupId),
          isNull(jointAccountTxTable.expenseCategory),
        ));
      await trx
        .delete(reversalLinksTable)
        .where(and(
          eq(reversalLinksTable.reversalTransactionId, link.reversalTransactionId),
          eq(reversalLinksTable.groupId, groupId),
        ));
    });
  }
  const deposit = await loadTx(link?.reversalTransactionId ?? params.data.id, groupId);
  res.json(deposit ? await reversalOptions(deposit, groupId) : { available: reversalLinksReady(), linked: null, candidates: [] });
});

// DELETE /joint-account/:id
router.delete("/joint-account/:id", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  const parsed = IdParam.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }

  // Deleting the money back would drop the link and leave the payment with no
  // category for good; deleting the payment would bring the money back as income.
  const reversedDelete = await refuseWhileReversed(parsed.data.id, groupId);
  if (reversedDelete) { res.status(409).json({ error: reversedDelete }); return; }

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
