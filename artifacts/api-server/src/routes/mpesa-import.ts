import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { bankAccountsTable, db, jointAccountTxTable } from "@workspace/db";
import { getActiveGroupId, requireGroupManager } from "../lib/activeGroup";
import { canonicalExpenseCategoryName } from "../lib/categoryNames";
import { headingAmong, postingToHeadingError } from "../lib/category-headings";
import { budgetCategoriesTable } from "@workspace/db";
import { buildFormatReport, readPaste, type ImportItem } from "../lib/mpesa-parser/import";
import { feedbackLimiter } from "../middlewares/rateLimit";
import { EmailNotConfiguredError, sendEmail } from "../lib/email";
import { findMpesaAccount, mpesaBalance, nairobiToday } from "../lib/mpesa-balance";
import { addMissingCharges } from "../lib/mpesa-charges";
import { findDifference } from "../lib/mpesa-difference";

const router = Router();

/**
 * What is said about an entry this budget already has: enough to show it and, for
 * plain spending, to offer a different category. Only ordinary spending can have
 * its category changed here: not a loan out, a transfer, a savings move, a charge
 * or an entry linked to an expense.
 */
const recordedColumns = {
  receipt: jointAccountTxTable.mpesaReceipt,
  date: jointAccountTxTable.date,
  description: jointAccountTxTable.description,
  type: jointAccountTxTable.type,
  category: jointAccountTxTable.expenseCategory,
  isLending: jointAccountTxTable.isLending,
  bankTransferId: jointAccountTxTable.bankTransferId,
  expenseId: jointAccountTxTable.expenseId,
  savingsGoalId: jointAccountTxTable.savingsGoalId,
  chargeFor: jointAccountTxTable.chargeForTransactionId,
};

type RecordedRow = {
  receipt: string | null;
  date: string | Date;
  description: string;
  type: string;
  category: string | null;
  isLending: boolean | null;
  bankTransferId: string | null;
  expenseId: number | null;
  savingsGoalId: number | null;
  chargeFor: number | null;
};

const describeRecorded = (row: RecordedRow) => ({
  date: String(row.date),
  description: row.description,
  category: row.category ?? null,
  editable:
    row.type === "disbursement" &&
    !row.isLending &&
    row.bankTransferId === null &&
    row.expenseId === null &&
    row.savingsGoalId === null &&
    row.chargeFor === null,
});

const previewSchema = z.object({
  text: z.string().trim().min(1, "Paste at least one M-Pesa message.").max(100_000, "That is too much text to read at once."),
});

/**
 * Reads pasted M-Pesa messages into lines a person can review, without
 * recording anything. Each line says whether it can be recorded as it is,
 * whether this budget already has it, or why it cannot be.
 *
 * The messages are read and forgotten: nothing here is logged or stored, the
 * same rule the parser was built under. Recording goes through the ordinary
 * deposit and disbursement routes, which carry the receipt and refuse a repeat.
 */
/**
 * Whether this workspace has anything saved from M-Pesa - an entry carrying an
 * M-Pesa code - for the setup checklist's "Import your M-Pesa" step. Asked of
 * the server, not the device, so an import on the phone ticks it on the web.
 */
router.get("/mpesa/import/status", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const [row] = await db
    .select({ id: jointAccountTxTable.id })
    .from(jointAccountTxTable)
    .where(and(eq(jointAccountTxTable.groupId, groupId), isNotNull(jointAccountTxTable.mpesaReceipt)))
    .limit(1);
  res.json({ imported: Boolean(row) });
});

router.post("/mpesa/import/preview", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const parsed = previewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Paste an M-Pesa message." });
    return;
  }

  const items = readPaste(parsed.data.text);
  // A Fuliza notice shares its payment's receipt code, so it must not be judged a repeat of it.
  const receipts = items
    .filter((item) => item.type !== "fuliza_notice")
    .map((item) => item.receipt)
    .filter((code): code is string => Boolean(code));

  const recorded = receipts.length === 0 ? [] : await db
    .select(recordedColumns)
    .from(jointAccountTxTable)
    .where(and(eq(jointAccountTxTable.groupId, groupId), inArray(jointAccountTxTable.mpesaReceipt, receipts)));
  const byReceipt = new Map(recorded.map((row) => [row.receipt, row]));

  // A code that appears twice in one paste is the same message forwarded twice.
  const seen = new Set<string>();
  const lines = items.map((item: ImportItem) => {
    if (item.type === "fuliza_notice") return { ...item, alreadyRecorded: null };
    const existing = item.receipt ? byReceipt.get(item.receipt) : undefined;
    const repeatedInPaste = item.receipt ? seen.has(item.receipt) : false;
    if (item.receipt) seen.add(item.receipt);
    return {
      ...item,
      alreadyRecorded: existing
        ? describeRecorded(existing)
        : repeatedInPaste
          ? { date: null, description: "You pasted this one twice, so only the first copy is used." }
          : null,
    };
  });

  res.json({
    lines,
    readable: lines.filter((line) => line.status === "ready" && !line.alreadyRecorded).length,
  });
});

const receiptsSchema = z.object({
  receipts: z.array(z.string().trim().regex(/^[A-Z0-9]{8,15}$/, "That is not a receipt code.")).min(1).max(2_000),
});

/**
 * Which of these receipt codes this budget already has, for a statement read on
 * the person's own device. Only the codes arrive, never the statement, and
 * nothing is logged or stored. A statement holds the same payments a pasted
 * message does, under the same code, so a payment recorded either way is
 * recognised the other way.
 */
router.post("/mpesa/import/check-receipts", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const parsed = receiptsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Send the receipt codes to check." });
    return;
  }

  const codes = [...new Set(parsed.data.receipts)];
  const recorded = await db
    .select(recordedColumns)
    .from(jointAccountTxTable)
    .where(and(eq(jointAccountTxTable.groupId, groupId), inArray(jointAccountTxTable.mpesaReceipt, codes)));

  res.json({ recorded: recorded.map((row) => ({ receipt: row.receipt, ...describeRecorded(row) })) });
});

const recategoriseSchema = z.object({
  changes: z
    .array(
      z.object({
        receipt: z.string().trim().regex(/^[A-Z0-9]{8,15}$/, "That is not a receipt code."),
        category: z.string().trim().min(1, "Choose a category.").max(80),
      }),
    )
    .min(1)
    .max(2_000),
});

/**
 * Changes only the category of entries this budget already has from M-Pesa, found
 * by receipt code, so a month recorded one way can be made to match another
 * without deleting anything. Nothing else about an entry is touched, and only
 * ordinary spending qualifies. A group manager's job, as editing any recorded
 * spending is.
 */
router.post("/mpesa/import/recategorise", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  const parsed = recategoriseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Send the receipts and categories to change." });
    return;
  }

  // One category per receipt: the last one sent wins, so a receipt is never changed twice.
  const wanted = new Map<string, string>();
  for (const change of parsed.data.changes) {
    const name = canonicalExpenseCategoryName(change.category);
    if (!name) {
      res.status(400).json({ error: "Choose a valid budget category." });
      return;
    }
    wanted.set(change.receipt, name);
  }

  const names = [...new Set(wanted.values())];
  const known = await db
    .select({ name: budgetCategoriesTable.name })
    .from(budgetCategoriesTable)
    .where(and(eq(budgetCategoriesTable.groupId, groupId), inArray(budgetCategoriesTable.name, names)));
  const knownNames = new Set(known.map((row) => row.name));
  for (const name of names) {
    if (!knownNames.has(name)) {
      res.status(400).json({ error: `"${name}" is not a category in this budget.` });
      return;
    }
    const heading = await headingAmong(groupId, [name]);
    if (heading) {
      res.status(400).json({ error: postingToHeadingError(heading) });
      return;
    }
  }

  let updated = 0;
  const skipped: string[] = [];
  await db.transaction(async (tx) => {
    for (const [receipt, category] of wanted) {
      const rows = await tx
        .update(jointAccountTxTable)
        .set({ expenseCategory: category })
        .where(
          and(
            eq(jointAccountTxTable.groupId, groupId),
            eq(jointAccountTxTable.mpesaReceipt, receipt),
            eq(jointAccountTxTable.type, "disbursement"),
            eq(jointAccountTxTable.isLending, false),
            isNull(jointAccountTxTable.bankTransferId),
            isNull(jointAccountTxTable.expenseId),
            isNull(jointAccountTxTable.savingsGoalId),
            isNull(jointAccountTxTable.chargeForTransactionId),
          ),
        )
        .returning({ id: jointAccountTxTable.id });
      if (rows.length > 0) updated += 1;
      else skipped.push(receipt);
    }
  });

  res.json({ updated, skipped });
});

const reportSchema = z.object({
  message: z.string().trim().min(10, "There is no message to send.").max(2_000, "That message is too long."),
});

/**
 * Sends one M-Pesa message the parser could not read to the people who
 * maintain the parser, so its format can be added.
 *
 * Opt-in and one message at a time: the person sees the text and can black out
 * anything before it leaves the phone. It goes through the same CRM relay
 * feedback uses, but carries nothing that says who sent it, and nothing is
 * kept here or logged.
 *
 * Env: FEEDBACK_CRM_URL, FEEDBACK_CRM_KEY (the feedback relay's). Absent = the
 * route says so rather than pretending it sent.
 */
router.post("/mpesa/report-format", feedbackLimiter, async (req, res): Promise<void> => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Nothing to send." });
    return;
  }

  const report = buildFormatReport(parsed.data.message);

  // The feedback CRM when it is set up, and otherwise (or if it cannot be
  // reached) an email to the Jamvi inbox, which needs nothing more than the mail
  // setup the app already has. Either way, nothing about who sent it goes along,
  // and nothing is logged or kept here.
  if (await sendToCrm(report)) {
    res.status(201).json({ ok: true, via: "crm" });
    return;
  }
  const emailed = await sendByEmail(report);
  if (emailed === "sent") {
    res.status(201).json({ ok: true, via: "email" });
    return;
  }
  if (emailed === "not-configured") {
    res.status(503).json({ error: "Sending is not set up yet. Please try again later." });
    return;
  }
  res.status(502).json({ error: "Could not send it right now. Please try again." });
});

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** True when the feedback CRM took it. False when it is not set up or could not be reached. */
async function sendToCrm(report: string): Promise<boolean> {
  const url = process.env.FEEDBACK_CRM_URL;
  const key = process.env.FEEDBACK_CRM_KEY;
  if (!url || !key) return false;
  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        product: "jamvi",
        message: report,
        rating: null,
        // A stable label, not a person: format reports are not attributable.
        submittedBy: "mpesa-format-report",
        appVersion: null,
        context: "mpesa-format",
      }),
    });
    return upstream.ok;
  } catch {
    return false;
  }
}

async function sendByEmail(report: string): Promise<"sent" | "not-configured" | "failed"> {
  try {
    await sendEmail({
      from: process.env.INVITATION_FROM_EMAIL?.trim() || "Jamvi <info@jamvi.co.ke>",
      to: [process.env.MPESA_REPORT_TO?.trim() || "info@jamvi.co.ke"],
      subject: "M-Pesa format report",
      html: `<pre style="font-family:monospace;white-space:pre-wrap">${escapeHtml(report)}</pre>`,
    });
    return "sent";
  } catch (error) {
    return error instanceof EmailNotConfiguredError ? "not-configured" : "failed";
  }
}

/**
 * The home screen's M-Pesa panel: what this workspace's M-Pesa did in a month.
 *
 * M-Pesa is what people open Jamvi for, so Home leads with it rather than with
 * budget cards. Counts every saved entry carrying an M-Pesa code, the same
 * test the status route above uses, so "came in" and "went out" are money that
 * moved through M-Pesa as recorded here - transfers between your own accounts
 * included - and not a claim about income or spending, which the budget
 * figures already make. The latest entry's date is across all months, so a
 * quiet month still says when M-Pesa was last brought in.
 */
router.get("/mpesa/summary", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const now = new Date();
  const askedMonth = Number(req.query.month);
  const askedYear = Number(req.query.year);
  const month = Number.isInteger(askedMonth) && askedMonth >= 1 && askedMonth <= 12 ? askedMonth : now.getMonth() + 1;
  const year = Number.isInteger(askedYear) && askedYear >= 2000 && askedYear <= 2100 ? askedYear : now.getFullYear();
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

  const fromMpesa = and(eq(jointAccountTxTable.groupId, groupId), isNotNull(jointAccountTxTable.mpesaReceipt));
  const [totals] = await db
    .select({
      entries: sql<number>`count(*)::int`,
      moneyIn: sql<number>`coalesce(sum(case when ${jointAccountTxTable.type} = 'deposit' then ${jointAccountTxTable.amount} else 0 end), 0)::float8`,
      moneyOut: sql<number>`coalesce(sum(case when ${jointAccountTxTable.type} = 'disbursement' then ${jointAccountTxTable.amount} else 0 end), 0)::float8`,
    })
    .from(jointAccountTxTable)
    .where(and(fromMpesa, gte(jointAccountTxTable.date, from), lte(jointAccountTxTable.date, to)));
  const [latest] = await db
    .select({ date: jointAccountTxTable.date })
    .from(jointAccountTxTable)
    .where(fromMpesa)
    .orderBy(desc(jointAccountTxTable.date), desc(jointAccountTxTable.id))
    .limit(1);

  // The M-Pesa account's balance today, to check against the M-Pesa app.
  const balance = await mpesaBalance(groupId, nairobiToday()).catch(() => null);

  res.json({
    month,
    year,
    imported: Boolean(latest),
    latestDate: latest?.date ?? null,
    entries: totals?.entries ?? 0,
    moneyIn: totals?.moneyIn ?? 0,
    moneyOut: totals?.moneyOut ?? 0,
    balance: balance?.balance ?? null,
    balanceAccount: balance?.accountName ?? null,
  });
});

const differenceSchema = z.object({
  messages: z.array(z.object({
    receipt: z.string().trim().regex(/^[A-Z0-9]{8,15}$/).nullable(),
    balance: z.number().finite(),
    at: z.number().finite(),
    day: z.string().date(),
    record: z.literal(false).optional(),
  })).min(1, "No M-Pesa messages with a balance were found.").max(6_000),
});

/**
 * "Find the difference" (lib/mpesa-difference.ts): the phone sends, for each
 * M-Pesa message, only its receipt code, the balance it states and when it
 * came - never the message itself - and gets back the days on which Jamvi's
 * M-Pesa account and M-Pesa parted, with the entries that explain each.
 * Nothing is stored or changed.
 */
router.post("/mpesa/difference", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const parsed = differenceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Those messages could not be read." });
    return;
  }
  const account = await findMpesaAccount(groupId);
  if (!account) {
    res.status(404).json({ error: "This budget has no M-Pesa account to compare with." });
    return;
  }

  const rows = await db
    .select({
      id: jointAccountTxTable.id,
      date: jointAccountTxTable.date,
      type: jointAccountTxTable.type,
      amount: jointAccountTxTable.amount,
      receipt: jointAccountTxTable.mpesaReceipt,
      description: jointAccountTxTable.description,
      chargeFor: jointAccountTxTable.chargeForTransactionId,
    })
    .from(jointAccountTxTable)
    .where(and(eq(jointAccountTxTable.groupId, groupId), eq(jointAccountTxTable.accountId, account.id)));
  // A charge carries no code of its own, and a Fuliza fee carries its
  // payment's with "FEE" on the end: both belong to that payment's message.
  const receiptOfId = new Map(rows.map((row) => [row.id, row.receipt]));
  const ledger = rows.map((row) => ({
    id: row.id,
    date: String(row.date).slice(0, 10),
    signed: row.type === "deposit" ? Number(row.amount) : -Number(row.amount),
    receipt: row.receipt,
    description: row.description,
    covers: row.chargeFor !== null
      ? receiptOfId.get(row.chargeFor) ?? null
      : row.receipt?.endsWith("FEE") ? row.receipt.slice(0, -3) : null,
  }));

  // Messages this account does not have: saved to another of this budget's accounts?
  const here = new Set(ledger.map((entry) => entry.receipt).filter(Boolean));
  const absent = [...new Set(parsed.data.messages.map((message) => message.receipt).filter((code): code is string => Boolean(code) && !here.has(code)))];
  const elsewhere = new Map<string, { account: string; date: string }>();
  for (let i = 0; i < absent.length; i += 2_000) {
    const found = await db
      .select({ receipt: jointAccountTxTable.mpesaReceipt, date: jointAccountTxTable.date, account: bankAccountsTable.name })
      .from(jointAccountTxTable)
      .innerJoin(bankAccountsTable, eq(bankAccountsTable.id, jointAccountTxTable.accountId))
      .where(and(
        eq(jointAccountTxTable.groupId, groupId),
        ne(jointAccountTxTable.accountId, account.id),
        inArray(jointAccountTxTable.mpesaReceipt, absent.slice(i, i + 2_000)),
      ));
    for (const row of found) if (row.receipt) elsewhere.set(row.receipt, { account: row.account, date: String(row.date).slice(0, 10) });
  }

  const result = findDifference(parsed.data.messages, ledger, account.openingBalance, elsewhere);
  res.json({ account: { id: account.id, name: account.name, openingBalance: account.openingBalance }, result });
});

const differenceFixSchema = z.object({
  move: z.array(z.string().trim().regex(/^[A-Z0-9]{8,15}$/)).max(2_000).default([]),
  redate: z.array(z.object({ id: z.number().int().positive(), date: z.string().date() })).max(2_000).default([]),
  // An M-Pesa charge its message states, never saved: added to its payment. No
  // M-Pesa charge comes near KES 1,000; a bigger one is not a charge (5 Oct 2026).
  charges: z.array(z.object({ entryId: z.number().int().positive(), amount: z.number().positive().max(1_000) })).max(2_000).default([]),
});

/**
 * "Fix all" on Find the difference, after one confirmation on the phone:
 * - `move`: payments M-Pesa's messages show, saved to another of this budget's
 *   accounts, moved to the M-Pesa account - with their own M-Pesa charge.
 *   A move between accounts or to savings is left alone: both sides belong.
 * - `redate`: entries in the M-Pesa account saved under another day than their
 *   message, given the message's day.
 * Only entries carrying an M-Pesa code are touched, and nothing is deleted:
 * an entry in none of the messages is left for the person to look at.
 */
router.post("/mpesa/difference/fix", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  const parsed = differenceFixSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Those fixes could not be read." });
    return;
  }
  const account = await findMpesaAccount(groupId);
  if (!account) {
    res.status(404).json({ error: "This budget has no M-Pesa account." });
    return;
  }
  const result = await db.transaction(async (tx) => {
    let moved = 0;
    if (parsed.data.move.length > 0) {
      const rows = await tx
        .update(jointAccountTxTable)
        .set({ accountId: account.id })
        .where(and(
          eq(jointAccountTxTable.groupId, groupId),
          inArray(jointAccountTxTable.mpesaReceipt, parsed.data.move),
          ne(jointAccountTxTable.accountId, account.id),
          isNull(jointAccountTxTable.bankTransferId),
          isNull(jointAccountTxTable.savingsGoalId),
        ))
        .returning({ id: jointAccountTxTable.id });
      moved = rows.length;
      if (rows.length > 0) {
        await tx
          .update(jointAccountTxTable)
          .set({ accountId: account.id })
          .where(and(
            eq(jointAccountTxTable.groupId, groupId),
            inArray(jointAccountTxTable.chargeForTransactionId, rows.map((row) => row.id)),
          ));
      }
    }
    let redated = 0;
    for (const change of parsed.data.redate) {
      const rows = await tx
        .update(jointAccountTxTable)
        .set({ date: change.date })
        .where(and(
          eq(jointAccountTxTable.groupId, groupId),
          eq(jointAccountTxTable.id, change.id),
          eq(jointAccountTxTable.accountId, account.id),
          isNotNull(jointAccountTxTable.mpesaReceipt),
        ))
        .returning({ id: jointAccountTxTable.id });
      redated += rows.length;
      // Its M-Pesa charge goes with it, or the day stays out by the charge.
      if (rows.length > 0) {
        await tx
          .update(jointAccountTxTable)
          .set({ date: change.date })
          .where(and(eq(jointAccountTxTable.groupId, groupId), eq(jointAccountTxTable.chargeForTransactionId, change.id)));
      }
    }
    const charged = await addMissingCharges(tx, groupId, account.id, parsed.data.charges);
    return { moved, redated, charged };
  });
  res.json(result);
});

const matchSchema = z.object({ liveBalance: z.number().finite().min(-10_000_000).max(10_000_000) });

/**
 * "Match M-Pesa now", the one tap ("you are telling me this can't be fixed by
 * a single tap?", 5 Oct 2026): what is left between Jamvi's M-Pesa figure and
 * M-Pesa's own goes into the account's opening balance. Not an entry: one
 * would count as income or spending that nobody can name. Nothing else
 * changes, and the phone says the old opening balance so it can be put back.
 */
router.post("/mpesa/difference/match", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  const parsed = matchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Send the M-Pesa balance to match." });
    return;
  }
  const account = await findMpesaAccount(groupId);
  const now = account ? await mpesaBalance(groupId, nairobiToday()) : null;
  if (!account || !now) {
    res.status(404).json({ error: "This budget has no M-Pesa account." });
    return;
  }
  const change = Math.round((parsed.data.liveBalance - now.balance) * 100) / 100;
  const openingAfter = Math.round((account.openingBalance + change) * 100) / 100;
  if (Math.abs(change) >= 0.01) {
    await db.update(bankAccountsTable).set({ openingBalance: openingAfter })
      .where(and(eq(bankAccountsTable.groupId, groupId), eq(bankAccountsTable.id, account.id)));
  }
  res.json({
    account: account.name,
    before: now.balance,
    after: Math.round((now.balance + change) * 100) / 100,
    change,
    openingBefore: account.openingBalance,
    openingAfter: Math.abs(change) >= 0.01 ? openingAfter : account.openingBalance,
  });
});

export default router;
