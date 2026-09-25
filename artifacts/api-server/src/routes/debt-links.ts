import { Router } from "express";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, debtEntryLinksTable, groupContributorsTable, jointAccountTxTable } from "@workspace/db";
import { getActiveGroupId } from "../lib/activeGroup";

const router = Router();

const KINDS = ["pay-back", "lend", "repaid", "borrowed"] as const;

const saveSchema = z.object({
  links: z
    .array(
      z.object({
        transactionId: z.number().int().positive(),
        partyId: z.number().int().positive(),
        kind: z.enum(KINDS),
      }),
    )
    .min(1)
    .max(500),
});

/**
 * Records which person each debt entry was for, right after the entries are saved.
 *
 * A side table, read only when an entry is deleted so its balance change can be
 * offered back. Both the entry and the person must belong to the active budget, so
 * an id from another budget cannot be linked by guessing.
 */
router.post("/debt-links", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Send the entries and the people they were for." });
    return;
  }

  const transactionIds = [...new Set(parsed.data.links.map((link) => link.transactionId))];
  const partyIds = [...new Set(parsed.data.links.map((link) => link.partyId))];
  const [mine, parties] = await Promise.all([
    db
      .select({ id: jointAccountTxTable.id })
      .from(jointAccountTxTable)
      .where(and(eq(jointAccountTxTable.groupId, groupId), inArray(jointAccountTxTable.id, transactionIds))),
    db
      .select({ id: groupContributorsTable.id })
      .from(groupContributorsTable)
      .where(and(eq(groupContributorsTable.groupId, groupId), inArray(groupContributorsTable.id, partyIds))),
  ]);
  const okTransactions = new Set(mine.map((row) => row.id));
  const okParties = new Set(parties.map((row) => row.id));
  const valid = parsed.data.links.filter((link) => okTransactions.has(link.transactionId) && okParties.has(link.partyId));

  if (valid.length > 0) {
    await db
      .insert(debtEntryLinksTable)
      .values(valid.map((link) => ({ groupId, transactionId: link.transactionId, partyId: link.partyId, kind: link.kind })))
      .onConflictDoUpdate({
        target: debtEntryLinksTable.transactionId,
        set: { partyId: sql`excluded.party_id`, kind: sql`excluded.kind` },
      });
  }
  res.json({ saved: valid.length, skipped: parsed.data.links.length - valid.length });
});

/**
 * The people some entries were for, asked before deleting them, so the balances
 * they moved can be offered back. Entries saved before this existed have no link
 * and are simply absent from the answer.
 */
router.get("/debt-links", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const ids = String(req.query.ids ?? "")
    .split(",")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)
    .slice(0, 500);
  if (ids.length === 0) {
    res.json({ links: [] });
    return;
  }

  const rows = await db
    .select({
      transactionId: debtEntryLinksTable.transactionId,
      partyId: debtEntryLinksTable.partyId,
      kind: debtEntryLinksTable.kind,
    })
    .from(debtEntryLinksTable)
    .where(and(eq(debtEntryLinksTable.groupId, groupId), inArray(debtEntryLinksTable.transactionId, ids)));
  res.json({ links: rows });
});

export default router;
