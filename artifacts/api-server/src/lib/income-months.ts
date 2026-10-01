import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { amountForMonth, type MonthChange } from "./budget-months";

/**
 * Expected income that changes over time (migration 0051) - the same model as
 * budget history (lib/budget-months.ts). An income source's
 * expectedMonthlyAmount is what it is expected to bring in now; when that
 * changes, the amount it had is recorded against the month the change took
 * effect, so earlier months keep what was expected then. "Only this month"
 * rows are one month's expectation alone.
 *
 * Made by the server after it starts and read defensively: without the table
 * every month expects expectedMonthlyAmount, as before.
 */

let ready = false;

export function incomeMonthsReady(): boolean {
  return ready;
}

export function setIncomeMonthsReadyForTests(value: boolean): void {
  ready = value;
}

export async function ensureIncomeMonths(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "income_source_months" (
        "id" serial PRIMARY KEY,
        "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "income_source_id" integer NOT NULL REFERENCES "income_sources"("id") ON DELETE CASCADE,
        "year" integer NOT NULL,
        "month" integer NOT NULL,
        "amount" integer NOT NULL,
        "only_this_month" boolean NOT NULL DEFAULT false,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "income_source_months_source_month_idx" ON "income_source_months" ("income_source_id", "year", "month", "only_this_month")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "income_source_months_group_idx" ON "income_source_months" ("group_id")`);
    ready = true;
    logger.info("Income history is ready");
  } catch (err) {
    logger.warn({ err }, "income_source_months is not available yet; every month expects the source's amount");
    const retry = setTimeout(() => void ensureIncomeMonths(), 60_000);
    retry.unref?.();
  }
}

const index = (year: number, month: number) => year * 12 + (month - 1);

function changesFrom(result: { rows: unknown[] }): Array<MonthChange & { sourceId: number }> {
  return (result.rows as Array<Record<string, unknown>>).map((raw) => ({
    sourceId: Number(raw.income_source_id),
    year: Number(raw.year),
    month: Number(raw.month),
    amount: Number(raw.amount),
    onlyThisMonth: Boolean(raw.only_this_month),
  }));
}

/** The changes recorded for a group's income sources that bear on a month. Never throws. */
export async function incomeHistoryFor(groupId: number, year: number, month: number): Promise<Map<number, MonthChange[]>> {
  const bySource = new Map<number, MonthChange[]>();
  if (!ready) return bySource;
  try {
    const result = await db.execute(sql`
      SELECT income_source_id, year, month, amount, only_this_month
      FROM income_source_months
      WHERE group_id = ${groupId} AND (year * 12 + month - 1) >= ${index(year, month)}`);
    for (const change of changesFrom(result)) bySource.set(change.sourceId, [...(bySource.get(change.sourceId) ?? []), change]);
  } catch (err) {
    logger.warn({ err }, "Could not read income history; using each source's expected amount");
  }
  return bySource;
}

/** Sources as loaded, each expecting what was expected of it in that month. */
export function withMonthExpected<T extends { id: number; expectedMonthlyAmount: number }>(
  rows: readonly T[],
  history: ReadonlyMap<number, readonly MonthChange[]>,
  year: number,
  month: number,
): T[] {
  if (history.size === 0) return [...rows];
  return rows.map((row) => {
    const changes = history.get(row.id);
    return changes ? { ...row, expectedMonthlyAmount: amountForMonth(changes, Number(row.expectedMonthlyAmount), year, month) } : row;
  });
}

/** Loads the month's history and applies it. */
export async function monthExpected<T extends { id: number; expectedMonthlyAmount: number }>(groupId: number, rows: readonly T[], year: number, month: number): Promise<T[]> {
  return withMonthExpected(rows, await incomeHistoryFor(groupId, year, month), year, month);
}

/**
 * Before a source's expected amount changes from `from` on: keeps what every
 * earlier month expected (see keepEarlierMonths in budget-months). Never throws.
 */
export async function keepEarlierIncomeMonths(input: { groupId: number; sourceId: number; previous: number; from: { year: number; month: number } }): Promise<void> {
  if (!ready) return;
  try {
    const { groupId, sourceId, previous, from } = input;
    const result = await db.execute(sql`
      SELECT income_source_id, year, month, amount, only_this_month FROM income_source_months WHERE income_source_id = ${sourceId}`);
    const before = index(from.year, from.month) - 1;
    const hadBefore = amountForMonth(changesFrom(result), previous, Math.floor(before / 12), (before % 12) + 1);
    await db.execute(sql`
      DELETE FROM income_source_months
      WHERE income_source_id = ${sourceId} AND NOT only_this_month AND (year * 12 + month - 1) > ${index(from.year, from.month)}`);
    await db.execute(sql`
      INSERT INTO income_source_months (group_id, income_source_id, year, month, amount, only_this_month)
      VALUES (${groupId}, ${sourceId}, ${from.year}, ${from.month}, ${hadBefore}, false)
      ON CONFLICT (income_source_id, year, month, only_this_month) DO NOTHING`);
  } catch (err) {
    logger.warn({ err }, "Could not keep earlier months' expected income");
  }
}

/** One month's expected income alone, leaving every other month as it is. */
export async function setIncomeOnlyThisMonth(input: { groupId: number; sourceId: number; year: number; month: number; amount: number }): Promise<void> {
  await db.execute(sql`
    INSERT INTO income_source_months (group_id, income_source_id, year, month, amount, only_this_month)
    VALUES (${input.groupId}, ${input.sourceId}, ${input.year}, ${input.month}, ${input.amount}, true)
    ON CONFLICT (income_source_id, year, month, only_this_month) DO UPDATE SET amount = EXCLUDED.amount, created_at = now()`);
}
