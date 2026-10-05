import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { jointAccountTxTable as tx } from "@workspace/db";

/**
 * An account's entries and totals, added up by the database.
 *
 * GET /joint-account used to fetch every entry and add them up in code: the
 * balance, the money-in and money-out totals, and each row's running balance,
 * which walked the whole ledger from the newest entry back. All of it needed
 * every entry in memory, so the list could never be sent a page at a time.
 * Now the totals are one query and each row carries its own running balance,
 * so a page of entries is enough to show them correctly (docs/account-list-paging.md).
 *
 * Takes the database as an argument so the SQL can be checked against a real
 * Postgres without the app's connection.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PgDatabase<any, any, any>;

/** One account's entries, or every account's when there is no account. */
export function ledgerScope(groupId: number, accountId: number | null): SQL {
  return accountId === null
    ? eq(tx.groupId, groupId)
    : and(eq(tx.groupId, groupId), eq(tx.accountId, accountId))!;
}

/** An entry's effect on the balance: money in adds, anything else takes away. */
const signedAmount = sql`CASE WHEN ${tx.type} = 'deposit' THEN ${tx.amount} ELSE -${tx.amount} END`;

/**
 * Entries newest first, each with the sum of itself and every entry before it
 * (oldest first, ties broken by when it was recorded and then by id, the same
 * order reversed). Opening balance plus that sum is the balance just after the
 * entry: its running balance, future-dated entries included.
 */
export async function ledgerEntries(db: Db, groupId: number, accountId: number | null) {
  const rows = await db
    .select({
      entry: tx,
      sumThroughThis: sql<string | number>`sum(${signedAmount}) OVER (ORDER BY ${tx.date} ASC, ${tx.createdAt} ASC, ${tx.id} ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`,
    })
    .from(tx)
    .where(ledgerScope(groupId, accountId))
    .orderBy(desc(tx.date), desc(tx.createdAt), desc(tx.id));
  return rows.map((row) => ({ entry: row.entry, sumThroughThis: Number(row.sumThroughThis) }));
}

/**
 * The totals as at `today` (YYYY-MM-DD, Kenyan date). An entry dated in the
 * future has not happened yet, so it is listed but not counted. The money-in
 * and money-out totals leave out moves between the person's own accounts.
 */
export async function ledgerTotals(db: Db, groupId: number, accountId: number | null, today: string) {
  const happened = sql`${tx.date} <= ${today}::date`;
  const [row] = await db
    .select({
      ledgerDeposits: sql<string | number>`coalesce(sum(${tx.amount}) FILTER (WHERE ${tx.type} = 'deposit' AND ${happened}), 0)`,
      ledgerDisbursements: sql<string | number>`coalesce(sum(${tx.amount}) FILTER (WHERE ${tx.type} = 'disbursement' AND ${happened}), 0)`,
      totalDeposits: sql<string | number>`coalesce(sum(${tx.amount}) FILTER (WHERE ${tx.type} = 'deposit' AND ${happened} AND ${tx.bankTransferId} IS NULL), 0)`,
      totalDisbursements: sql<string | number>`coalesce(sum(${tx.amount}) FILTER (WHERE ${tx.type} = 'disbursement' AND ${happened} AND ${tx.bankTransferId} IS NULL), 0)`,
    })
    .from(tx)
    .where(ledgerScope(groupId, accountId));
  return {
    ledgerDeposits: Number(row?.ledgerDeposits ?? 0),
    ledgerDisbursements: Number(row?.ledgerDisbursements ?? 0),
    totalDeposits: Number(row?.totalDeposits ?? 0),
    totalDisbursements: Number(row?.totalDisbursements ?? 0),
  };
}
