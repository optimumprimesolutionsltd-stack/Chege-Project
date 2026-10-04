import { and, eq, isNotNull, lte, sql } from "drizzle-orm";
import { bankAccountsTable, db, jointAccountTxTable } from "@workspace/db";

/**
 * The M-Pesa account's balance as Jamvi has it, for the Home card - asked for
 * 3 Oct 2026: the card's money in and out "is not giving the true state of
 * affairs", and the one figure to check against the M-Pesa app is the balance.
 *
 * Which account is M-Pesa: one named so ("M-Pesa", "Mpesa", "M Pesa"), else
 * the one holding the most entries with an M-Pesa code. The balance is worked
 * out as the Bank tab does: opening balance, plus money in, less money out,
 * up to today - an entry dated later has not happened yet.
 */
export const MPESA_NAME = /\bm[\s-]?pesa\b/i;

export function pickMpesaAccount(
  accounts: ReadonlyArray<{ id: number; name: string }>,
  codesByAccount: ReadonlyMap<number, number>,
): number | null {
  const named = accounts.find((account) => MPESA_NAME.test(account.name));
  if (named) return named.id;
  let best: number | null = null;
  let most = 0;
  for (const account of accounts) {
    const count = codesByAccount.get(account.id) ?? 0;
    if (count > most) { most = count; best = account.id; }
  }
  return best;
}

/** The budget's M-Pesa account, chosen as pickMpesaAccount says, or null when it has no accounts. */
export async function findMpesaAccount(groupId: number): Promise<{ id: number; name: string; openingBalance: number } | null> {
  const accounts = await db
    .select({ id: bankAccountsTable.id, name: bankAccountsTable.name, openingBalance: bankAccountsTable.openingBalance })
    .from(bankAccountsTable)
    .where(eq(bankAccountsTable.groupId, groupId));
  if (accounts.length === 0) return null;
  const counts = await db
    .select({ accountId: jointAccountTxTable.accountId, count: sql<number>`count(*)::int` })
    .from(jointAccountTxTable)
    .where(and(eq(jointAccountTxTable.groupId, groupId), isNotNull(jointAccountTxTable.mpesaReceipt)))
    .groupBy(jointAccountTxTable.accountId);
  const chosen = pickMpesaAccount(accounts, new Map(counts.filter((row) => row.accountId != null).map((row) => [row.accountId as number, row.count])));
  const account = accounts.find((row) => row.id === chosen);
  return account ? { id: account.id, name: account.name, openingBalance: Number(account.openingBalance) } : null;
}

export async function mpesaBalance(groupId: number, today: string): Promise<{ accountName: string; balance: number } | null> {
  const account = await findMpesaAccount(groupId);
  if (!account) return null;
  const [sums] = await db
    .select({
      moneyIn: sql<number>`coalesce(sum(case when ${jointAccountTxTable.type} = 'deposit' then ${jointAccountTxTable.amount} else 0 end), 0)::float8`,
      moneyOut: sql<number>`coalesce(sum(case when ${jointAccountTxTable.type} = 'disbursement' then ${jointAccountTxTable.amount} else 0 end), 0)::float8`,
    })
    .from(jointAccountTxTable)
    .where(and(eq(jointAccountTxTable.groupId, groupId), eq(jointAccountTxTable.accountId, account.id), lte(jointAccountTxTable.date, today)));
  const balance = Math.round((account.openingBalance + (sums?.moneyIn ?? 0) - (sums?.moneyOut ?? 0)) * 100) / 100;
  return { accountName: account.name, balance };
}

/** Today in Kenya, as the Bank tab counts it. */
export function nairobiToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
