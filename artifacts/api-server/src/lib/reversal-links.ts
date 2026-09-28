import { db } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Whether reversal_links exists yet, and the one condition every income figure
 * adds once it does.
 *
 * A "money back" deposit linked to the payment it reversed is not income (see
 * migration 0047). Every query that counts deposits as income has to leave it
 * out - but a query naming a table that is not there fails outright, and
 * migrations here are run by hand after a deploy. So the condition is only
 * added once the table is known to exist; until then the figures are exactly
 * what they were, which is right, because nothing can be linked yet either.
 *
 * Known at startup and rechecked, not asked per request, so the figures cost no
 * extra round trip and the request paths keep the queries they always had.
 */

let ready = false;

export function reversalLinksReady(): boolean {
  return ready;
}

/** For tests: pretend the table exists, or not. */
export function setReversalLinksReadyForTests(value: boolean): void {
  ready = value;
}

/**
 * `AND NOT EXISTS (...)` leaving out a deposit that reverses a payment, or
 * nothing at all while the table is missing. `depositId` is the deposit's id
 * column as the calling query names it, for example sql`t.id`.
 */
export function notAReversal(depositId: SQL | unknown): SQL {
  if (!ready) return sql``;
  return sql`AND NOT EXISTS (SELECT 1 FROM reversal_links rl WHERE rl.reversal_transaction_id = ${depositId})`;
}

// Built when used, not at load, so importing this touches nothing.
const createStatement = () => sql`
  CREATE TABLE IF NOT EXISTS "reversal_links" (
    "reversal_transaction_id" integer PRIMARY KEY
      REFERENCES "joint_account_transactions"("id") ON DELETE CASCADE,
    "original_transaction_id" integer NOT NULL UNIQUE
      REFERENCES "joint_account_transactions"("id") ON DELETE CASCADE,
    "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
    "original_category" text,
    "created_at" timestamp with time zone NOT NULL DEFAULT now()
  )`;

/**
 * Make sure the table exists, then remember that it does. The same statement as
 * migration 0047 and just as idempotent, so running migrate later records it
 * without changing anything - the precedent is password_hash in index.ts.
 *
 * Called after the server is listening and never allowed to stop it: if it
 * fails, reversals simply stay unavailable and every figure stays as it was.
 * Retried every minute until it succeeds.
 */
export async function ensureReversalLinks(): Promise<void> {
  try {
    await db.execute(createStatement());
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "reversal_links_group_idx" ON "reversal_links" ("group_id")`);
    ready = true;
    logger.info("Reversal links are ready");
  } catch (err) {
    logger.warn({ err }, "reversal_links is not available yet; money back is counted as before");
    const retry = setTimeout(() => void ensureReversalLinks(), 60_000);
    retry.unref?.();
  }
}
