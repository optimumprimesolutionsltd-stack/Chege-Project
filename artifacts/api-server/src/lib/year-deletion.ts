/**
 * Deleting a whole past year from a Personal budget, for good.
 *
 * Asked for on 4 Oct 2026 ("delete 2025 for good, that is for me"): a year of
 * entries brought in and half sorted got in the way of making this year right.
 * Only a Personal budget - nobody else's records go with it - only a year
 * before this one, and only after a code emailed to the owner
 * (lib/account-deletion.ts, requestYearDeletionCode).
 *
 * What goes is everything dated in that year: expenses (with what hangs off
 * them), bank and M-Pesa entries (with their own charges and links), the
 * year's contributions, and the savings moves tied to a deleted bank entry.
 * What stays is everything without a date: categories, income sources, goals,
 * accounts and their opening balances.
 */

import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  contributionsTable,
  expensesTable,
  groupPayoutsTable,
  jointAccountTxTable,
  savingsGoalContributionsTable,
} from "@workspace/db";
import type { DbOrTransaction } from "./account-deletion";

export type YearCounts = { expenses: number; bankEntries: number; contributions: number };

/** The year a past year may be: before this one, and not before Jamvi existed. */
export function deletableYear(year: number, currentYear: number): boolean {
  return Number.isInteger(year) && year >= 2000 && year < currentYear;
}

const firstDay = (year: number) => `${year}-01-01`;
const lastDay = (year: number) => `${year}-12-31`;

export async function yearCounts(tx: DbOrTransaction, groupId: number, year: number): Promise<YearCounts> {
  const count = sql<number>`count(*)::int`;
  const [[expenses], [bankEntries], [contributions]] = await Promise.all([
    tx.select({ n: count }).from(expensesTable)
      .where(and(eq(expensesTable.groupId, groupId), gte(expensesTable.date, firstDay(year)), lte(expensesTable.date, lastDay(year)))),
    tx.select({ n: count }).from(jointAccountTxTable)
      .where(and(eq(jointAccountTxTable.groupId, groupId), gte(jointAccountTxTable.date, firstDay(year)), lte(jointAccountTxTable.date, lastDay(year)))),
    tx.select({ n: count }).from(contributionsTable)
      .where(and(eq(contributionsTable.groupId, groupId), eq(contributionsTable.year, year))),
  ]);
  return { expenses: Number(expenses?.n ?? 0), bankEntries: Number(bankEntries?.n ?? 0), contributions: Number(contributions?.n ?? 0) };
}

/** The past years this budget holds entries in, newest first, with how many. */
export async function pastYears(tx: DbOrTransaction, groupId: number, currentYear: number): Promise<Array<{ year: number } & YearCounts>> {
  const rows = await tx.execute(sql`
    SELECT DISTINCT y FROM (
      SELECT extract(year FROM "date")::int AS y FROM "expenses" WHERE "group_id" = ${groupId}
      UNION SELECT extract(year FROM "date")::int FROM "joint_account_transactions" WHERE "group_id" = ${groupId}
      UNION SELECT "year" FROM "contributions" WHERE "group_id" = ${groupId}
    ) years WHERE y < ${currentYear} ORDER BY y DESC`);
  const years = (rows.rows as Array<{ y: number }>).map((row) => Number(row.y)).filter((year) => deletableYear(year, currentYear));
  return Promise.all(years.map(async (year) => ({ year, ...(await yearCounts(tx, groupId, year)) })));
}

/**
 * Deletes the year inside the caller's transaction, children first so the
 * restrict foreign keys never stop it part way. Returns what went.
 */
export async function deleteYear(tx: DbOrTransaction, groupId: number, year: number): Promise<YearCounts> {
  const counts = await yearCounts(tx, groupId, year);
  const inYear = (column: typeof expensesTable.date | typeof jointAccountTxTable.date) =>
    and(gte(column, firstDay(year)), lte(column, lastDay(year)));

  // Cascades allocations, income splits, and any bank entry made for a split-funded expense.
  await tx.delete(expensesTable).where(and(eq(expensesTable.groupId, groupId), inYear(expensesTable.date)));

  const entries = await tx.select({ id: jointAccountTxTable.id }).from(jointAccountTxTable)
    .where(and(eq(jointAccountTxTable.groupId, groupId), inYear(jointAccountTxTable.date)));
  const ids = entries.map((entry) => entry.id);
  for (let i = 0; i < ids.length; i += 2_000) {
    const chunk = ids.slice(i, i + 2_000);
    // A savings move is two halves: the bank side goes, so its savings side does too.
    await tx.delete(savingsGoalContributionsTable).where(and(
      eq(savingsGoalContributionsTable.groupId, groupId),
      inArray(savingsGoalContributionsTable.bankTransactionId, chunk),
    ));
  }
  // Cascades deposit splits, charges, debt and reversal links, entries to sort;
  // a payout pointing at one keeps its row with no transaction.
  await tx.delete(jointAccountTxTable).where(and(eq(jointAccountTxTable.groupId, groupId), inYear(jointAccountTxTable.date)));
  await tx.delete(contributionsTable).where(and(eq(contributionsTable.groupId, groupId), eq(contributionsTable.year, year)));
  await tx.delete(groupPayoutsTable).where(and(eq(groupPayoutsTable.groupId, groupId), gte(groupPayoutsTable.date, firstDay(year)), lte(groupPayoutsTable.date, lastDay(year))));
  return counts;
}
