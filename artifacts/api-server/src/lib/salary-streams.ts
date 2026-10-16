import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { businessStreams, businessStreamsReady, salaryStreamName } from "./business-streams";
import { moveIncomeSource } from "./combine-income-sources";

/**
 * One salary stream per business that pays you one.
 *
 * Answering "Yes, a salary" makes the business's salary stream so pay can be
 * filed under it (#778). It looked for one by its exact name - "Ujenzi
 * Distributors salary" - so the person's own "Ujenzi salary", made long
 * before, was not found and a second appeared ("check why we have two
 * salaries for ujenzi and optimum", 16 Oct 2026). A salary stream is now any
 * stream (not itself a business) whose name says "salary" and the business's
 * own first word; the person's oldest is the one kept, and any later ones are
 * folded into it, entries and all.
 */

/** Words that say nothing about which business it is. */
const NOT_A_NAME = new Set(["the", "and", "ltd", "limited", "company", "co", "plc", "inc", "llc", "group", "enterprises", "enterprise", "salary"]);

/** The business's own word - "ujenzi" for Ujenzi Distributors Ltd, "optimum" for Optimum Prime Solutions. */
export function businessWord(business: string): string | null {
  const words = business.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/);
  return words.find((word) => word.length >= 3 && !NOT_A_NAME.has(word)) ?? null;
}

/** The streams that are this business's salary, oldest first. */
export function salaryStreamsFor(
  business: { id: number; name: string },
  sources: ReadonlyArray<{ id: number; name: string }>,
  businessIds: ReadonlySet<number>,
): Array<{ id: number; name: string }> {
  const word = businessWord(business.name);
  const exact = salaryStreamName(business.name).toLowerCase();
  return sources
    .filter((source) => source.id !== business.id && !businessIds.has(source.id))
    .filter((source) => {
      const name = source.name.trim().toLowerCase();
      if (name === exact) return true;
      if (!word || !/\bsalar(y|ies)\b/.test(name)) return false;
      return name.replace(/[^a-z0-9]+/g, " ").split(" ").includes(word);
    })
    .sort((a, b) => a.id - b.id);
}

async function budgetSources(groupId: number): Promise<Array<{ id: number; name: string; userId: string }>> {
  const result = await db.execute(sql`SELECT "id", "name", "user_id" AS "userId" FROM "income_sources" WHERE "group_id" = ${groupId} ORDER BY "id"`);
  return (result.rows as Array<{ id: number; name: string; userId: string }>).map((row) => ({ id: Number(row.id), name: String(row.name), userId: String(row.userId) }));
}

/**
 * The business's salary stream: the person's own when they have one, else one
 * made for it, named as onboarding names it. Returns it, or null when the
 * business is not this budget's.
 */
export async function findOrMakeSalaryStream(groupId: number, businessId: number): Promise<{ id: number; name: string } | null> {
  const sources = await budgetSources(groupId);
  const business = sources.find((source) => source.id === businessId);
  if (!business) return null;
  const businessIds = new Set(businessStreamsReady() ? (await businessStreams(groupId)).map((one) => one.id) : []);
  const found = salaryStreamsFor(business, sources, businessIds)[0];
  if (found) return found;
  const made = await db.execute(sql`
    INSERT INTO "income_sources" ("group_id", "user_id", "name", "is_main", "expected_monthly_amount")
    VALUES (${groupId}, ${business.userId}, ${salaryStreamName(business.name)}, false, 0)
    RETURNING "id", "name"`);
  const created = made.rows[0] as { id: number; name: string } | undefined;
  return created ? { id: Number(created.id), name: String(created.name) } : null;
}

/**
 * For every business that pays a salary: its salary streams beyond the first
 * folded into the first, entries and all. Returns how many streams went.
 */
export async function foldDuplicateSalaryStreams(groupId: number): Promise<number> {
  if (!businessStreamsReady()) return 0;
  const businesses = await businessStreams(groupId);
  const salaried = businesses.filter((business) => business.paysSalary === true);
  if (salaried.length === 0) return 0;
  const businessIds = new Set(businesses.map((business) => business.id));
  const sources = await budgetSources(groupId);
  let folded = 0;
  for (const business of salaried) {
    const [keep, ...extra] = salaryStreamsFor(business, sources, businessIds);
    if (!keep || extra.length === 0) continue;
    await db.transaction(async (trx) => {
      for (const duplicate of extra) {
        await moveIncomeSource(trx, groupId, duplicate.id, keep.id);
        folded += 1;
      }
    });
  }
  return folded;
}
