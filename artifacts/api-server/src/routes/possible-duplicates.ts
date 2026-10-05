import { Router } from "express";
import { z } from "zod";
import { getActiveGroupId, requireGroupManager } from "../lib/activeGroup";
import { dismissPair, findTwins, listPossibleDuplicates, receiptsElsewhere } from "../lib/possible-duplicates";

const router = Router();

/** Pairs in this budget that may be one payment recorded twice (lib/possible-duplicates). */
router.get("/possible-duplicates", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const pairs = await listPossibleDuplicates(groupId);
  res.json({ pairs, count: pairs.length });
});

const dismissSchema = z.object({
  typedKind: z.enum(["expense", "entry"]),
  typedId: z.number().int().positive(),
  importedId: z.number().int().positive(),
});

/** "Different payments": the pair is never shown again. Editing entries is a manager's job. */
router.post("/possible-duplicates/dismiss", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  const parsed = dismissSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Say which two entries are different payments." });
    return;
  }
  await dismissPair(groupId, parsed.data.typedKind, parsed.data.typedId, parsed.data.importedId);
  res.json({ dismissed: true });
});

const checkSchema = z.object({
  against: z.enum(["typed", "imported"]),
  items: z.array(z.object({
    key: z.string().min(1).max(40),
    amount: z.number().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    direction: z.enum(["in", "out"]),
    accountId: z.number().int().positive().nullable().optional(),
  })).min(1).max(2_000),
});

/**
 * Entries already in this budget that could be the same payment as each item:
 * lines being imported checked against what was typed by hand, or an entry
 * being typed checked against what came from M-Pesa. Only amounts and dates
 * arrive; nothing is kept.
 */
router.post("/possible-duplicates/check", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const parsed = checkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Send the payments to check." });
    return;
  }
  const matches = await findTwins(groupId, parsed.data.items, parsed.data.against);
  res.json({ matches });
});

const elsewhereSchema = z.object({
  receipts: z.array(z.string().trim().regex(/^[A-Z0-9]{8,15}$/)).min(1).max(2_000),
});

/**
 * Which of these M-Pesa codes are already in another of the person's budgets, by
 * that budget's name: one statement imported into Personal and into a chama
 * would otherwise record a payment in both. Kept apart from routes/mpesa-import,
 * which never reads who is asking (its relayed reports must carry nothing about them).
 */
router.post("/possible-duplicates/elsewhere", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const parsed = elsewhereSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Send the receipt codes to check." });
    return;
  }
  const elsewhere = await receiptsElsewhere(groupId, req.user!.id, [...new Set(parsed.data.receipts)]);
  res.json({ elsewhere });
});

export default router;
