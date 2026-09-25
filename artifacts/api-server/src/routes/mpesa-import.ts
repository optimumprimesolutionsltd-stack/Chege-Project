import { Router } from "express";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db, jointAccountTxTable } from "@workspace/db";
import { getActiveGroupId } from "../lib/activeGroup";
import { readPaste, type ImportItem } from "../lib/mpesa-parser/import";

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
  const receipts = items.map((item) => item.receipt).filter((code): code is string => Boolean(code));

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
    const existing = item.receipt ? byReceipt.get(item.receipt) : undefined;
    const repeatedInPaste = item.receipt ? seen.has(item.receipt) : false;
    if (item.receipt) seen.add(item.receipt);
    return {
      ...item,
      alreadyRecorded: existing
        ? { date: String(existing.date), description: existing.description }
        : repeatedInPaste
          ? { date: null, description: "The same message appears twice in what you pasted." }
          : null,
    };
  });

  res.json({
    lines,
    readable: lines.filter((line) => line.status === "ready" && !line.alreadyRecorded).length,
  });
});

export default router;
