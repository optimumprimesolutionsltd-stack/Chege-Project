import { db } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Your businesses, named by you - not every income stream.
 *
 * Jamvi used to treat any income stream with a cost linked to it as a
 * business, so "Ujenzi salary" showed up among the businesses ("right now
 * income streams appear under businesses ... add a section I can create
 * business name", 8 Oct 2026). A business is still an income stream - its
 * sales are money in under it, its costs the categories linked to it - but
 * only the ones marked here are businesses.
 *
 * And, as with a business's bank account, a business is kept out of personal:
 * money in filed under it (its sales) is not your income, and spending in its
 * cost categories is not your spending. Both show in the Business report. Your
 * pay from it - "Ujenzi salary" - stays an ordinary income stream.
 *
 * Until a budget marks a business, nothing changes for it: the Business report
 * shows streams with costs, and every figure is what it was.
 */

let ready = false;

export function businessStreamsReady(): boolean {
  return ready;
}

export function setBusinessStreamsReadyForTests(value: boolean): void {
  ready = value;
}

export async function ensureBusinessStreams(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "business_streams" (
        "income_source_id" integer PRIMARY KEY REFERENCES "income_sources"("id") ON DELETE CASCADE,
        "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "business_streams_group_idx" ON "business_streams" ("group_id")`);
    ready = true;
    logger.info("Business streams are ready");
  } catch (err) {
    logger.warn({ err }, "business_streams is not available yet; streams with costs count as businesses");
    const retry = setTimeout(() => void ensureBusinessStreams(), 60_000);
    retry.unref?.();
  }
}

export async function businessStreamIds(groupId: number): Promise<number[]> {
  if (!ready) return [];
  const result = await db.execute(sql`SELECT "income_source_id" AS id FROM "business_streams" WHERE "group_id" = ${groupId}`);
  return (result.rows as Array<{ id: number }>).map((row) => Number(row.id));
}

/** A business, or not, for one of this budget's income streams. False when the stream is not this budget's. */
export async function setBusinessStream(groupId: number, incomeSourceId: number, business: boolean): Promise<boolean> {
  if (!ready) return false;
  const owned = await db.execute(sql`SELECT 1 FROM "income_sources" WHERE "id" = ${incomeSourceId} AND "group_id" = ${groupId} LIMIT 1`);
  if (owned.rows.length === 0) return false;
  if (business) {
    await db.execute(sql`
      INSERT INTO "business_streams" ("income_source_id", "group_id") VALUES (${incomeSourceId}, ${groupId})
      ON CONFLICT ("income_source_id") DO NOTHING`);
  } else {
    await db.execute(sql`DELETE FROM "business_streams" WHERE "income_source_id" = ${incomeSourceId} AND "group_id" = ${groupId}`);
  }
  return true;
}

/** True, in SQL, for spending in a category that is one of the businesses' costs. */
export function isBusinessCost(groupId: number, category: SQL | unknown): SQL {
  if (!ready) return sql`false`;
  return sql`EXISTS (SELECT 1 FROM budget_categories bcb JOIN business_streams bs ON bs.income_source_id = bcb.reduces_income_source_id
    WHERE bcb.group_id = ${groupId} AND bs.group_id = ${groupId} AND bcb.name = ${category})`;
}

/** The condition a personal spending figure adds: not one of the businesses' costs. */
export function notBusinessCost(groupId: number, category: SQL | unknown): SQL {
  if (!ready) return sql``;
  return sql` AND NOT ${isBusinessCost(groupId, category)}`;
}

/** True, in SQL, for money in filed under one of the businesses: its sales. */
export function isBusinessSale(incomeSourceId: SQL | unknown): SQL {
  if (!ready) return sql`false`;
  return sql`EXISTS (SELECT 1 FROM business_streams bs WHERE bs.income_source_id = ${incomeSourceId})`;
}

/** The condition every income figure adds through notAReversal: not a business's sales. */
export function notBusinessSale(transactionId: SQL | unknown): SQL {
  if (!ready) return sql``;
  return sql` AND NOT EXISTS (SELECT 1 FROM joint_account_transactions st JOIN business_streams bs ON bs.income_source_id = st.income_source_id WHERE st.id = ${transactionId})`;
}
