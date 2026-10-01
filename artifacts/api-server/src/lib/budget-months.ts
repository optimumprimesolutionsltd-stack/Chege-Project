import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Budgets that change over time (migration 0050).
 *
 * A category's budgetAmount is its budget now - this month and every month
 * after - so every screen that reads it keeps working. What changes is the
 * past: when the amount changes, the amount it had is recorded here against
 * the month the change took effect ("until October it was 80,000"), so earlier
 * months keep the budget they had. A month uses the first such change after
 * it, or budgetAmount when no change comes later. Any edit records this - the
 * phone, the web, anything - so the past is never rewritten by accident.
 *
 * "Only this month" is the other kind of row: that month alone, nothing else.
 *
 * The same startup pattern as import_tidy_kept: the table is made after the
 * server is listening and never allowed to stop it. Until it exists every
 * month simply uses budgetAmount, as before.
 */

let ready = false;

export function budgetMonthsReady(): boolean {
  return ready;
}

/** For tests: pretend the table exists, or not. */
export function setBudgetMonthsReadyForTests(value: boolean): void {
  ready = value;
}

export async function ensureBudgetMonths(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "budget_category_months" (
        "id" serial PRIMARY KEY,
        "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "category_id" integer NOT NULL REFERENCES "budget_categories"("id") ON DELETE CASCADE,
        "year" integer NOT NULL,
        "month" integer NOT NULL,
        "amount" integer NOT NULL,
        "only_this_month" boolean NOT NULL DEFAULT false,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "budget_category_months_category_month_idx" ON "budget_category_months" ("category_id", "year", "month", "only_this_month")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "budget_category_months_group_idx" ON "budget_category_months" ("group_id")`);
    ready = true;
    logger.info("Budget history is ready");
  } catch (err) {
    logger.warn({ err }, "budget_category_months is not available yet; every month uses the category's budget");
    const retry = setTimeout(() => void ensureBudgetMonths(), 60_000);
    retry.unref?.();
  }
}

export type BudgetMonthRow = { categoryId: number; year: number; month: number; amount: number; onlyThisMonth: boolean };
/** One recorded change, for anything with a monthly amount (budgets, expected income). */
export type MonthChange = { year: number; month: number; amount: number; onlyThisMonth: boolean };

const index = (year: number, month: number) => year * 12 + (month - 1);

/**
 * A category's budget in a month: an "only this month" row for it; else the
 * amount recorded by the first change after it (what the budget was until
 * then); else `current`, the budget now.
 */
export function amountForMonth(rows: readonly MonthChange[], current: number, year: number, month: number): number {
  const at = index(year, month);
  const only = rows.find((row) => row.onlyThisMonth && index(row.year, row.month) === at);
  if (only) return only.amount;
  let next: MonthChange | undefined;
  for (const row of rows) {
    if (row.onlyThisMonth || index(row.year, row.month) <= at) continue;
    if (!next || index(row.year, row.month) < index(next.year, next.month)) next = row;
  }
  return next ? next.amount : current;
}

function rowsFrom(result: { rows: unknown[] }): BudgetMonthRow[] {
  return (result.rows as Array<Record<string, unknown>>).map((raw) => ({
    categoryId: Number(raw.category_id),
    year: Number(raw.year),
    month: Number(raw.month),
    amount: Number(raw.amount),
    onlyThisMonth: Boolean(raw.only_this_month),
  }));
}

/** The changes recorded for a group's categories that bear on a month. Never throws: no table, no changes. */
export async function budgetHistoryFor(groupId: number, year: number, month: number): Promise<Map<number, BudgetMonthRow[]>> {
  const byCategory = new Map<number, BudgetMonthRow[]>();
  if (!ready) return byCategory;
  try {
    const result = await db.execute(sql`
      SELECT category_id, year, month, amount, only_this_month
      FROM budget_category_months
      WHERE group_id = ${groupId} AND (year * 12 + month - 1) >= ${index(year, month)}`);
    for (const row of rowsFrom(result)) byCategory.set(row.categoryId, [...(byCategory.get(row.categoryId) ?? []), row]);
  } catch (err) {
    logger.warn({ err }, "Could not read budget history; using each category's budget");
  }
  return byCategory;
}

/** Rows as loaded, each with the budget it had in that month. */
export function withMonthBudgets<T extends { id: number; budgetAmount: number }>(
  rows: readonly T[],
  history: ReadonlyMap<number, readonly BudgetMonthRow[]>,
  year: number,
  month: number,
): T[] {
  if (history.size === 0) return [...rows];
  return rows.map((row) => {
    const changes = history.get(row.id);
    return changes ? { ...row, budgetAmount: amountForMonth(changes, Number(row.budgetAmount), year, month) } : row;
  });
}

/** Loads the month's history and applies it: the one call a month view needs. */
export async function monthBudgets<T extends { id: number; budgetAmount: number }>(groupId: number, rows: readonly T[], year: number, month: number): Promise<T[]> {
  return withMonthBudgets(rows, await budgetHistoryFor(groupId, year, month), year, month);
}

/** This month, Nairobi time. */
export function nairobiMonth(now: Date = new Date()): { year: number; month: number } {
  const [year, month] = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit" }).format(now).split("-").map(Number);
  return { year, month };
}

/**
 * Before a category's budget changes from `from` on: keeps what every earlier
 * month had. Records the amount the month before `from` used against `from`
 * (unless a change there already says so), and drops changes after `from`,
 * which the new amount replaces from `from` on. Call it, then write the new
 * budgetAmount. Never throws: without history the edit simply applies to every
 * month, as it always did.
 */
export async function keepEarlierMonths(input: { groupId: number; categoryId: number; previous: number; from: { year: number; month: number } }): Promise<void> {
  if (!ready) return;
  try {
    const { groupId, categoryId, previous, from } = input;
    const result = await db.execute(sql`
      SELECT category_id, year, month, amount, only_this_month FROM budget_category_months WHERE category_id = ${categoryId}`);
    const rows = rowsFrom(result);
    const before = index(from.year, from.month) - 1;
    const hadBefore = amountForMonth(rows, previous, Math.floor(before / 12), (before % 12) + 1);
    await db.execute(sql`
      DELETE FROM budget_category_months
      WHERE category_id = ${categoryId} AND NOT only_this_month AND (year * 12 + month - 1) > ${index(from.year, from.month)}`);
    await db.execute(sql`
      INSERT INTO budget_category_months (group_id, category_id, year, month, amount, only_this_month)
      VALUES (${groupId}, ${categoryId}, ${from.year}, ${from.month}, ${hadBefore}, false)
      ON CONFLICT (category_id, year, month, only_this_month) DO NOTHING`);
  } catch (err) {
    logger.warn({ err }, "Could not keep earlier months' budget");
  }
}

/** A budget for one month only, leaving every other month as it is. */
export async function setOnlyThisMonth(input: { groupId: number; categoryId: number; year: number; month: number; amount: number }): Promise<void> {
  await db.execute(sql`
    INSERT INTO budget_category_months (group_id, category_id, year, month, amount, only_this_month)
    VALUES (${input.groupId}, ${input.categoryId}, ${input.year}, ${input.month}, ${input.amount}, true)
    ON CONFLICT (category_id, year, month, only_this_month) DO UPDATE SET amount = EXCLUDED.amount, created_at = now()`);
}
