import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Entries saved as "Not sure", to be sorted out later (migration 0053).
 *
 * Working through a year's statement, somebody often cannot say what an old
 * entry was. They save it anyway and Home reminds them:
 * - money out goes to the category NOT_SURE_CATEGORY, so it still counts as
 *   spending (every spending total needs a category) and is found by that;
 * - money in is saved with no income source and marked here, because an entry
 *   with no source is not otherwise something anybody asked to come back to.
 *
 * A side table like mpesa_entry_names: made after the server is listening,
 * never allowed to stop it, read only once it exists.
 */
export const NOT_SURE_CATEGORY = "Not sure yet";

let ready = false;

export function entriesToSortReady(): boolean {
  return ready;
}

export function setEntriesToSortReadyForTests(value: boolean): void {
  ready = value;
}

export async function ensureEntriesToSort(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "entries_to_sort" (
        "transaction_id" integer PRIMARY KEY
          REFERENCES "joint_account_transactions"("id") ON DELETE CASCADE,
        "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "entries_to_sort_group_idx" ON "entries_to_sort" ("group_id")`);
    ready = true;
    logger.info("Entries to sort are ready");
  } catch (err) {
    logger.warn({ err }, "entries_to_sort is not available yet; only Not sure yet spending is listed to sort");
    const retry = setTimeout(() => void ensureEntriesToSort(), 60_000);
    retry.unref?.();
  }
}
