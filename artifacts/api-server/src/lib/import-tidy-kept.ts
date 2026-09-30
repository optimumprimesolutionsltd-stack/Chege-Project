import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Imported entries somebody chose to leave as they are when Bank offered to
 * tidy them - a payment an import took for an M-Pesa charge, say. Never
 * offered again, on any device (migration 0049).
 *
 * The same startup pattern as reversal_links: the table is made after the
 * server is listening and never allowed to stop it; until it exists nothing
 * is left out of the tidy and "leave" answers that it cannot be kept yet, so
 * a phone falls back to remembering on the device.
 */

let ready = false;

export function importTidyKeptReady(): boolean {
  return ready;
}

/** For tests: pretend the table exists, or not. */
export function setImportTidyKeptReadyForTests(value: boolean): void {
  ready = value;
}

const createStatement = () => sql`
  CREATE TABLE IF NOT EXISTS "import_tidy_kept" (
    "transaction_id" integer PRIMARY KEY
      REFERENCES "joint_account_transactions"("id") ON DELETE CASCADE,
    "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
    "created_at" timestamp with time zone NOT NULL DEFAULT now()
  )`;

export async function ensureImportTidyKept(): Promise<void> {
  try {
    await db.execute(createStatement());
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "import_tidy_kept_group_idx" ON "import_tidy_kept" ("group_id")`);
    ready = true;
    logger.info("Import tidy choices are ready");
  } catch (err) {
    logger.warn({ err }, "import_tidy_kept is not available yet; leaving entries as they are stays on the device");
    const retry = setTimeout(() => void ensureImportTidyKept(), 60_000);
    retry.unref?.();
  }
}
