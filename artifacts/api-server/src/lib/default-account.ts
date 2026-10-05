import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Every budget has somewhere for money to be recorded.
 *
 * A Shared group was made with a "Bank account", but a Personal budget was
 * made with none, and every save of an entry needs an account. A new person
 * read their M-Pesa messages and Save did nothing at all (5 Oct 2026): the
 * import had no account to save into and stopped without a word. M-Pesa is
 * what Jamvi leads with, so that is the account a budget starts with.
 */
export const DEFAULT_ACCOUNT_NAME = "M-Pesa";

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

const rowsOf = (result: unknown): Array<{ group_id: number }> =>
  ((result as { rows?: Array<{ group_id: number }> }).rows ?? (result as Array<{ group_id: number }>));

/** Gives this budget an M-Pesa account if it has no account at all. Safe to repeat. */
export async function ensureBudgetHasAnAccount(groupId: number, executor: Executor = db): Promise<void> {
  await executor.execute(sql`
    INSERT INTO "bank_accounts" ("group_id", "name", "opening_balance")
    SELECT ${groupId}, ${DEFAULT_ACCOUNT_NAME}, 0
     WHERE NOT EXISTS (SELECT 1 FROM "bank_accounts" WHERE "group_id" = ${groupId})
    ON CONFLICT DO NOTHING`);
}

/**
 * The same for every budget already made without one, once at startup: after
 * the server is listening, and never allowed to stop it.
 */
export async function ensureEveryBudgetHasAnAccount(): Promise<void> {
  try {
    const result = await db.execute(sql`
      INSERT INTO "bank_accounts" ("group_id", "name", "opening_balance")
      SELECT g."id", ${DEFAULT_ACCOUNT_NAME}, 0
        FROM "groups" g
       WHERE NOT EXISTS (SELECT 1 FROM "bank_accounts" b WHERE b."group_id" = g."id")
      ON CONFLICT DO NOTHING
      RETURNING "group_id"`);
    const made = rowsOf(result).length;
    if (made > 0) logger.info({ budgets: made }, "Gave budgets with no account an M-Pesa account");
  } catch (err) {
    logger.warn({ err }, "Could not check for budgets with no account");
  }
}
