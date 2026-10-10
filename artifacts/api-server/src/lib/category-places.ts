import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Where a category's spending happens, for Reports only: at home - Household
 * upkeep - or outside the home ("in my option, i can tell what i spend at home
 * and what i spend outside ... my option should only count in reports",
 * 10 Oct 2026). Categories and their subcategories stay as they are; nothing
 * but Reports' "At home vs outside" reads this.
 *
 * Only a choice the person made is kept here. Every other category takes the
 * side Jamvi gives it by name (mobile-budget lib/homeSpending).
 */

let ready = false;

export function categoryPlacesReady(): boolean {
  return ready;
}

export async function ensureCategoryPlaces(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "category_places" (
        "category_id" integer PRIMARY KEY REFERENCES "budget_categories"("id") ON DELETE CASCADE,
        "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "at_home" boolean NOT NULL,
        "updated_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "category_places_group_idx" ON "category_places" ("group_id")`);
    ready = true;
    logger.info("Category places are ready");
  } catch (err) {
    logger.warn({ err }, "category_places is not available yet; every category takes its default side");
    const retry = setTimeout(() => void ensureCategoryPlaces(), 60_000);
    retry.unref?.();
  }
}

/** The sides this budget's people chose, by category id. */
export async function categoryPlaces(groupId: number): Promise<Array<{ categoryId: number; atHome: boolean }>> {
  if (!ready) return [];
  const result = await db.execute(sql`SELECT category_id AS "categoryId", at_home AS "atHome" FROM category_places WHERE group_id = ${groupId}`);
  return (result.rows as Array<{ categoryId: number; atHome: boolean }>).map((row) => ({ categoryId: Number(row.categoryId), atHome: row.atHome === true }));
}

/**
 * Puts a category at home or outside; null goes back to Jamvi's own side.
 * False when the category is not this budget's.
 */
export async function setCategoryPlace(groupId: number, categoryId: number, atHome: boolean | null): Promise<boolean> {
  const owned = await db.execute(sql`SELECT 1 FROM budget_categories WHERE id = ${categoryId} AND group_id = ${groupId}`);
  if (owned.rows.length === 0) return false;
  if (atHome === null) {
    await db.execute(sql`DELETE FROM category_places WHERE category_id = ${categoryId} AND group_id = ${groupId}`);
    return true;
  }
  await db.execute(sql`
    INSERT INTO category_places (category_id, group_id, at_home) VALUES (${categoryId}, ${groupId}, ${atHome})
    ON CONFLICT (category_id) DO UPDATE SET at_home = EXCLUDED.at_home, updated_at = now()`);
  return true;
}
