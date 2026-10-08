import { db } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Your businesses, named by you - never an income stream.
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
 * An income stream is never a business, costs linked to it or not: only the
 * businesses named in My businesses have costs and a Business report.
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
    // Whether its profit is counted here, in a Business report. Off for a
    // business whose money only passes through your phone - "this is not the
    // whole of Ujenzi in the app ... I am already drawing a salary from the
    // business", "there should be an option to count the business profits or
    // not" (8 Oct 2026). Either way it stays out of your personal figures.
    await db.execute(sql`ALTER TABLE "business_streams" ADD COLUMN IF NOT EXISTS "counts_profit" boolean NOT NULL DEFAULT true`);
    ready = true;
    logger.info("Business streams are ready");
  } catch (err) {
    logger.warn({ err }, "business_streams is not available yet; streams with costs count as businesses");
    const retry = setTimeout(() => void ensureBusinessStreams(), 60_000);
    retry.unref?.();
  }
}

export async function businessStreamIds(groupId: number): Promise<number[]> {
  return (await businessStreams(groupId)).map((business) => business.id);
}

/** This budget's businesses, and whether each one's profit is counted (a Business report) or its money only passes through. */
export async function businessStreams(groupId: number): Promise<Array<{ id: number; name: string; countsProfit: boolean }>> {
  if (!ready) return [];
  const result = await db.execute(sql`
    SELECT bs.income_source_id AS id, src.name, bs.counts_profit AS "countsProfit"
    FROM business_streams bs JOIN income_sources src ON src.id = bs.income_source_id
    WHERE bs.group_id = ${groupId}
    ORDER BY lower(src.name)`);
  return (result.rows as Array<{ id: number; name: string; countsProfit: boolean | null }>)
    .map((row) => ({ id: Number(row.id), name: String(row.name), countsProfit: row.countsProfit !== false }));
}

/** The businesses with a Business report: those whose profit is counted. */
export async function profitBusinessIds(groupId: number): Promise<number[]> {
  return (await businessStreams(groupId)).filter((business) => business.countsProfit).map((business) => business.id);
}

/** A business, or not, for one of this budget's income streams. False when the stream is not this budget's. */
export async function setBusinessStream(groupId: number, incomeSourceId: number, business: boolean, countsProfit?: boolean): Promise<boolean> {
  if (!ready) return false;
  const owned = await db.execute(sql`SELECT 1 FROM "income_sources" WHERE "id" = ${incomeSourceId} AND "group_id" = ${groupId} LIMIT 1`);
  if (owned.rows.length === 0) return false;
  if (business) {
    await db.execute(sql`
      INSERT INTO "business_streams" ("income_source_id", "group_id", "counts_profit") VALUES (${incomeSourceId}, ${groupId}, ${countsProfit ?? true})
      ON CONFLICT ("income_source_id") DO ${countsProfit === undefined ? sql`NOTHING` : sql`UPDATE SET "counts_profit" = ${countsProfit}`}`);
  } else {
    await db.execute(sql`DELETE FROM "business_streams" WHERE "income_source_id" = ${incomeSourceId} AND "group_id" = ${groupId}`);
  }
  return true;
}

/**
 * True, in SQL, for a category's link (budget_categories.reduces_income_source_id)
 * that is one of the businesses: the category is that business's cost. A link
 * to an ordinary income stream makes nothing a business cost - "remove logic of
 * income streams as businesses to avoid confusion" (8 Oct 2026) - so spending
 * there is ordinary spending, and the stream ordinary income.
 */
export function businessCostLink(groupId: number, link: SQL | unknown): SQL {
  if (!ready) return sql`false`;
  return sql`(${link} IS NOT NULL AND ${link} IN (SELECT bs.income_source_id FROM business_streams bs WHERE bs.group_id = ${groupId}))`;
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
