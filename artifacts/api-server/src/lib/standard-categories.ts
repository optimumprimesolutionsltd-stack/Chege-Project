import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Which of a budget's categories is its common category for each kind of payee
 * Jamvi knows - "eating-out", "electricity" (mobile lib/knownPayees).
 *
 * "All the recognized categories should be as per the app subject to the user
 * changing" (9 Oct 2026): Jamvi makes "Eating out" the first time a restaurant
 * is paid, and files restaurants there. Kept by the category's id, so renaming
 * it ("Hotels & food") or moving it under another heading keeps it; deleting
 * the category forgets it, and Jamvi makes a new one when it is next needed.
 *
 * A side table, like business_streams: made after the server is listening,
 * never allowed to stop it, read only once it exists.
 */

let ready = false;

export function standardCategoriesReady(): boolean {
  return ready;
}

export function setStandardCategoriesReadyForTests(value: boolean): void {
  ready = value;
}

export async function ensureStandardCategories(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "standard_categories" (
        "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "key" text NOT NULL,
        "category_id" integer NOT NULL REFERENCES "budget_categories"("id") ON DELETE CASCADE,
        "created_at" timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY ("group_id", "key")
      )`);
    ready = true;
    logger.info("Standard categories are ready");
  } catch (err) {
    logger.warn({ err }, "standard_categories is not available yet; common categories are found by name");
    const retry = setTimeout(() => void ensureStandardCategories(), 60_000);
    retry.unref?.();
  }
}

/** A key names a kind of payee: lower-case words joined by hyphens. */
export const isStandardKey = (key: unknown): key is string =>
  typeof key === "string" && /^[a-z][a-z0-9-]{0,39}$/.test(key);

/** This budget's common categories, by key, each with the category's id and name now. */
export async function standardCategories(groupId: number): Promise<Array<{ key: string; categoryId: number; name: string }>> {
  if (!ready) return [];
  const result = await db.execute(sql`
    SELECT sc.key, sc.category_id AS "categoryId", bc.name
    FROM standard_categories sc JOIN budget_categories bc ON bc.id = sc.category_id
    WHERE sc.group_id = ${groupId}`);
  return (result.rows as Array<{ key: string; categoryId: number; name: string }>)
    .map((row) => ({ key: String(row.key), categoryId: Number(row.categoryId), name: String(row.name) }));
}

/** Remembers a category as this budget's common one for a key. False when the category is not this budget's. */
export async function linkStandardCategory(groupId: number, key: string, categoryId: number): Promise<boolean> {
  if (!ready) return false;
  const owned = await db.execute(sql`SELECT 1 FROM "budget_categories" WHERE "id" = ${categoryId} AND "group_id" = ${groupId} LIMIT 1`);
  if (owned.rows.length === 0) return false;
  await db.execute(sql`
    INSERT INTO "standard_categories" ("group_id", "key", "category_id") VALUES (${groupId}, ${key}, ${categoryId})
    ON CONFLICT ("group_id", "key") DO UPDATE SET "category_id" = EXCLUDED."category_id"`);
  return true;
}
