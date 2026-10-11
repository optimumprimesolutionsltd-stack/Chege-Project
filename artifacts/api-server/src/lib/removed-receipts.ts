import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * M-Pesa codes of entries the person deleted, kept per budget.
 *
 * Deleting an entry took every trace of it, so the next statement or batch of
 * messages found its code missing and offered it as new: "the four entries are
 * removed from the app but still come back when i import pdf statement"
 * (11 Oct 2026). With the code kept, the import shows such a payment unticked,
 * saying it was removed, and the M-Pesa check leaves it out of what is missing.
 * Ticking it again brings it back: a code that is recorded counts as recorded,
 * whatever is kept here.
 */

let ready = false;

export function removedReceiptsReady(): boolean {
  return ready;
}

export async function ensureRemovedReceipts(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "removed_receipts" (
        "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "receipt" text NOT NULL,
        "removed_at" timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY ("group_id", "receipt")
      )`);
    ready = true;
    logger.info("Removed receipts are ready");
  } catch (err) {
    logger.warn({ err }, "removed_receipts is not available yet; deleted M-Pesa entries may be offered again");
    const retry = setTimeout(() => void ensureRemovedReceipts(), 60_000);
    retry.unref?.();
  }
}

/** Keeps the code of a deleted entry. Never fails the delete it follows. */
export async function rememberRemoved(groupId: number, receipt: string | null | undefined): Promise<void> {
  if (!ready || !receipt) return;
  try {
    await db.execute(sql`
      INSERT INTO "removed_receipts" ("group_id", "receipt") VALUES (${groupId}, ${receipt})
      ON CONFLICT DO NOTHING`);
  } catch (err) {
    logger.warn({ err, groupId }, "Could not keep a removed M-Pesa code");
  }
}

/** Which of these codes the person removed from this budget. */
export async function removedAmong(groupId: number, receipts: readonly string[]): Promise<string[]> {
  if (!ready || receipts.length === 0) return [];
  const found: string[] = [];
  for (let at = 0; at < receipts.length; at += 2_000) {
    const result = await db.execute(sql`
      SELECT "receipt" FROM "removed_receipts"
       WHERE "group_id" = ${groupId}
         AND "receipt" IN (${sql.join(receipts.slice(at, at + 2_000).map((code) => sql`${code}`), sql`, `)})`);
    for (const row of result.rows as Array<{ receipt: string }>) found.push(String(row.receipt));
  }
  return found;
}
