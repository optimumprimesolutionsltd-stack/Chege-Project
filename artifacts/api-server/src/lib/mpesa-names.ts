import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * The name M-Pesa gave an imported entry, kept when the person renamed the
 * payee during the import ("NAIVAS LTD" saved as "Supermarket") - so Search
 * still finds it by the name on the statement (migration 0052).
 *
 * A side table, like import_tidy_kept: made after the server is listening,
 * never allowed to stop it, and read only once it exists. A new column on
 * joint_account_transactions would have broken every bank query in the
 * minutes between the deploy and the column being added.
 */

let ready = false;

export function mpesaNamesReady(): boolean {
  return ready;
}

export function setMpesaNamesReadyForTests(value: boolean): void {
  ready = value;
}

export async function ensureMpesaNames(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "mpesa_entry_names" (
        "transaction_id" integer PRIMARY KEY
          REFERENCES "joint_account_transactions"("id") ON DELETE CASCADE,
        "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "name" text NOT NULL,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "mpesa_entry_names_group_idx" ON "mpesa_entry_names" ("group_id")`);
    ready = true;
    logger.info("M-Pesa entry names are ready");
  } catch (err) {
    logger.warn({ err }, "mpesa_entry_names is not available yet; Search uses entry descriptions only");
    const retry = setTimeout(() => void ensureMpesaNames(), 60_000);
    retry.unref?.();
  }
}
