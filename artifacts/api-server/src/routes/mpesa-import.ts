import { Router } from "express";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db, jointAccountTxTable } from "@workspace/db";
import { getActiveGroupId } from "../lib/activeGroup";
import { buildFormatReport, readPaste, type ImportItem } from "../lib/mpesa-parser/import";
import { feedbackLimiter } from "../middlewares/rateLimit";
import { EmailNotConfiguredError, sendEmail } from "../lib/email";

const router = Router();

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
    .select({
      receipt: jointAccountTxTable.mpesaReceipt,
      date: jointAccountTxTable.date,
      description: jointAccountTxTable.description,
    })
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
        ? { date: String(existing.date), description: existing.description }
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
    .select({
      receipt: jointAccountTxTable.mpesaReceipt,
      date: jointAccountTxTable.date,
      description: jointAccountTxTable.description,
    })
    .from(jointAccountTxTable)
    .where(and(eq(jointAccountTxTable.groupId, groupId), inArray(jointAccountTxTable.mpesaReceipt, codes)));

  res.json({
    recorded: recorded.map((row) => ({ receipt: row.receipt, date: String(row.date), description: row.description })),
  });
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
