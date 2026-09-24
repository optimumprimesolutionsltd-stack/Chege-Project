type Tx = { type: string; amount: number; date: string };

export type BalanceAccount =
  | {
      openingBalance?: number | null;
      balance?: number | null;
      transactions?: Tx[] | null;
    }
  | null
  | undefined;

/**
 * What the account held at the end of a given day: its opening balance plus
 * every posting dated on or before that day.
 *
 * "A day of banking" used to show today's balance whatever date was chosen, so
 * changing the date changed nothing on screen. Working a past day off a
 * statement needs the figure as it stood on that day. Falls back to the
 * current balance when the account carries no ledger to work from.
 */
export function balanceAsAt(account: BalanceAccount, date: string): number {
  if (!account) return 0;
  const transactions = account.transactions;
  if (!Array.isArray(transactions) || typeof account.openingBalance !== 'number') {
    return account.balance ?? 0;
  }
  const day = date.slice(0, 10);
  let total = account.openingBalance;
  for (const tx of transactions) {
    if (String(tx.date).slice(0, 10) > day) continue;
    total += tx.type === 'deposit' ? tx.amount : -tx.amount;
  }
  return Math.round(total * 100) / 100;
}
