import { db } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Money between you and your own business: owner's drawings and money put in.
 *
 * "If the user has a business, we can specify business account numbers and
 * every time money comes in through that number..." (8 Oct 2026). Asked how it
 * should count, the answer was owner's drawings: money taken from the business
 * is the owner's own money, not income; money put into it is not spending; and
 * no debt builds up either way.
 *
 * Marked in a side table, like reversal_links: made after the server is
 * listening, never allowed to stop it, read only once it exists.
 *  - money in from the business: no income source and left out of every
 *    income figure through notAReversal (lib/reversal-links), which each of
 *    them already adds;
 *  - money out to the business: no category, so no spending total counts it
 *    (every one needs a category).
 * Neither is a debt, so nothing is linked in Who owes who.
 */

let ready = false;

export function ownerBusinessReady(): boolean {
  return ready;
}

export function setOwnerBusinessReadyForTests(value: boolean): void {
  ready = value;
}

export async function ensureOwnerBusiness(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "owner_business_money" (
        "transaction_id" integer PRIMARY KEY
          REFERENCES "joint_account_transactions"("id") ON DELETE CASCADE,
        "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "owner_business_money_group_idx" ON "owner_business_money" ("group_id")`);
    ready = true;
    logger.info("Owner's business money is ready");
  } catch (err) {
    logger.warn({ err }, "owner_business_money is not available yet; money to and from a business counts as before");
    const retry = setTimeout(() => void ensureOwnerBusiness(), 60_000);
    retry.unref?.();
  }
}

/** The condition an income figure adds: not money from the owner's business. `id` as the calling query names it. */
export function notOwnerBusinessMoney(id: SQL | unknown): SQL {
  if (!ready) return sql``;
  return sql`AND NOT EXISTS (SELECT 1 FROM owner_business_money obm WHERE obm.transaction_id = ${id})`;
}

/** True, in SQL, for an entry marked as money between the owner and their business. */
export function isOwnerBusinessMoneySql(id: SQL | unknown): SQL {
  if (!ready) return sql`false`;
  return sql`EXISTS (SELECT 1 FROM owner_business_money obm WHERE obm.transaction_id = ${id})`;
}

/** Ids of this budget's entries marked as money between the owner and their business. */
export async function ownerBusinessIds(groupId: number): Promise<number[]> {
  if (!ready) return [];
  const result = await db.execute(sql`SELECT "transaction_id" AS id FROM "owner_business_money" WHERE "group_id" = ${groupId}`);
  return (result.rows as Array<{ id: number }>).map((row) => Number(row.id));
}

export async function isOwnerBusinessMoney(transactionId: number): Promise<boolean> {
  if (!ready) return false;
  const result = await db.execute(sql`SELECT 1 FROM "owner_business_money" WHERE "transaction_id" = ${transactionId} LIMIT 1`);
  return result.rows.length > 0;
}

