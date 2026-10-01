import { Router } from "express";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, jointAccountTxTable } from "@workspace/db";
import { getActiveGroupId } from "../lib/activeGroup";
import { mpesaNamesReady } from "../lib/mpesa-names";

const router = Router();

const saveSchema = z.object({
  names: z
    .array(z.object({ transactionId: z.number().int().positive(), name: z.string().trim().min(1).max(200) }))
    .min(1)
    .max(1000),
});

/**
 * Keeps the name M-Pesa gave each renamed entry, right after an import saves
 * (lib/mpesa-names). Only entries of the active budget are kept, so an id from
 * another budget cannot be named by guessing. Never in the way of saving: the
 * phone and web send it after, and ignore a failure.
 */
router.post("/mpesa-names", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!mpesaNamesReady()) {
    res.status(503).json({ error: "M-Pesa names cannot be kept yet." });
    return;
  }
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Send the entries and the names M-Pesa gave them." });
    return;
  }
  const ids = [...new Set(parsed.data.names.map((row) => row.transactionId))];
  const mine = await db
    .select({ id: jointAccountTxTable.id })
    .from(jointAccountTxTable)
    .where(and(eq(jointAccountTxTable.groupId, groupId), inArray(jointAccountTxTable.id, ids)));
  const ok = new Set(mine.map((row) => row.id));
  const valid = parsed.data.names.filter((row) => ok.has(row.transactionId));
  for (const row of valid) {
    await db.execute(sql`
      INSERT INTO mpesa_entry_names (transaction_id, group_id, name)
      VALUES (${row.transactionId}, ${groupId}, ${row.name})
      ON CONFLICT (transaction_id) DO UPDATE SET name = EXCLUDED.name`);
  }
  res.json({ saved: valid.length, skipped: parsed.data.names.length - valid.length });
});

export default router;
