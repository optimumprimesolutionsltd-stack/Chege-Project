import { db } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Bank accounts that are your business's, not yours.
 *
 * "When opening a bank account, one should be asked if it's for business or
 * personal" (8 Oct 2026); asked what a business account means, the answer was
 * to keep it out of personal: everything in it is the business's, so its
 * money in and out leaves your personal income, spending and reports and
 * shows in the Business report instead. Money moved between it and your own
 * accounts is a transfer, which no figure counts already.
 *
 * Marked in a side table, like owner_business_money: made after the server is
 * listening, never allowed to stop it, read only once it exists - until then
 * every figure is what it was.
 */

let ready = false;

export function businessAccountsReady(): boolean {
  return ready;
}

export function setBusinessAccountsReadyForTests(value: boolean): void {
  ready = value;
}

export async function ensureBusinessAccounts(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "business_bank_accounts" (
        "account_id" integer PRIMARY KEY REFERENCES "bank_accounts"("id") ON DELETE CASCADE,
        "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "business_bank_accounts_group_idx" ON "business_bank_accounts" ("group_id")`);
    // Which business, for somebody with more than one ("a user has many
    // businesses, it's good to specify to which business the money is going",
    // 8 Oct 2026). A business is an income stream, as in the Business report.
    await db.execute(sql`ALTER TABLE "business_bank_accounts" ADD COLUMN IF NOT EXISTS "income_source_id" integer REFERENCES "income_sources"("id") ON DELETE SET NULL`);
    ready = true;
    logger.info("Business bank accounts are ready");
  } catch (err) {
    logger.warn({ err }, "business_bank_accounts is not available yet; every account counts as personal");
    const retry = setTimeout(() => void ensureBusinessAccounts(), 60_000);
    retry.unref?.();
  }
}

/**
 * The condition a personal figure adds for an entry's account column: not in
 * one of the business's accounts. Entries with no account are personal.
 */
export function inPersonalAccount(accountId: SQL | unknown): SQL {
  if (!ready) return sql``;
  return sql` AND NOT EXISTS (SELECT 1 FROM business_bank_accounts bba WHERE bba.account_id = ${accountId})`;
}

/** The same, for a query that names only the entry: money in through notAReversal. */
export function notInBusinessAccount(transactionId: SQL | unknown): SQL {
  if (!ready) return sql``;
  return sql` AND NOT EXISTS (SELECT 1 FROM joint_account_transactions bt JOIN business_bank_accounts bba ON bba.account_id = bt.account_id WHERE bt.id = ${transactionId})`;
}

/** True, in SQL, for an entry in one of the business's accounts. */
export function isInBusinessAccount(accountId: SQL | unknown): SQL {
  if (!ready) return sql`false`;
  return sql`EXISTS (SELECT 1 FROM business_bank_accounts bba WHERE bba.account_id = ${accountId})`;
}

export async function businessAccountIds(groupId: number): Promise<number[]> {
  return (await businessAccounts(groupId)).map((row) => row.accountId);
}

/** This budget's business accounts, each with the business (income stream) it belongs to, when set. */
export async function businessAccounts(groupId: number): Promise<Array<{ accountId: number; incomeSourceId: number | null }>> {
  if (!ready) return [];
  const result = await db.execute(sql`SELECT "account_id" AS "accountId", "income_source_id" AS "incomeSourceId" FROM "business_bank_accounts" WHERE "group_id" = ${groupId}`);
  return (result.rows as Array<{ accountId: number; incomeSourceId: number | null }>).map((row) => ({
    accountId: Number(row.accountId),
    incomeSourceId: row.incomeSourceId == null ? null : Number(row.incomeSourceId),
  }));
}

/** Business or personal, for one of this budget's accounts. False when the account is not this budget's. */
export async function setAccountPurpose(groupId: number, accountId: number, business: boolean, incomeSourceId: number | null = null): Promise<boolean> {
  if (!ready) return false;
  const owned = await db.execute(sql`SELECT 1 FROM "bank_accounts" WHERE "id" = ${accountId} AND "group_id" = ${groupId} LIMIT 1`);
  if (owned.rows.length === 0) return false;
  // Only one of this budget's own businesses.
  const stream = incomeSourceId === null
    ? null
    : (await db.execute(sql`SELECT 1 FROM "income_sources" WHERE "id" = ${incomeSourceId} AND "group_id" = ${groupId} LIMIT 1`)).rows.length > 0
      ? incomeSourceId
      : null;
  if (business) {
    await db.execute(sql`
      INSERT INTO "business_bank_accounts" ("account_id", "group_id", "income_source_id") VALUES (${accountId}, ${groupId}, ${stream})
      ON CONFLICT ("account_id") DO UPDATE SET "income_source_id" = EXCLUDED."income_source_id"`);
  } else {
    await db.execute(sql`DELETE FROM "business_bank_accounts" WHERE "account_id" = ${accountId} AND "group_id" = ${groupId}`);
  }
  return true;
}
