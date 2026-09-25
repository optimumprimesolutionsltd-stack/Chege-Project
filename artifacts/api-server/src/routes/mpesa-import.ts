import { Router } from "express";
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, jointAccountTxTable } from "@workspace/db";
import { getActiveGroupId, requireGroupManager } from "../lib/activeGroup";
import { canonicalExpenseCategoryName } from "../lib/categoryNames";
import { headingAmong, postingToHeadingError } from "../lib/category-headings";
import { budgetCategoriesTable } from "@workspace/db";
import { buildFormatReport, readPaste, type ImportItem } from "../lib/mpesa-parser/import";
import { feedbackLimiter } from "../middlewares/rateLimit";
import { EmailNotConfiguredError, sendEmail } from "../lib/email";

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

export default router;
