export type MovableTx = { id: number; date: string };

export type DaySummary = { date: string; movable: number; total: number };

/** The calendar day of a posting, whatever precision the API sent. */
export function dayOf(date: string): string {
  return date.slice(0, 10);
}

/**
 * The days on an account that have something which can change accounts,
 * newest first. `canMove` is the same rule the single-entry move uses, so a
 * transfer, savings or expense-linked posting stays put and is counted in
 * `total` only — the person is told how many were left behind.
 */
export function summariseDays<T extends MovableTx>(
  transactions: T[],
  canMove: (tx: T) => boolean,
): DaySummary[] {
  const days = new Map<string, DaySummary>();
  for (const tx of transactions) {
    const date = dayOf(tx.date);
    const entry = days.get(date) ?? { date, movable: 0, total: 0 };
    entry.total += 1;
    if (canMove(tx)) entry.movable += 1;
    days.set(date, entry);
  }
  return [...days.values()].filter((day) => day.movable > 0).sort((a, b) => b.date.localeCompare(a.date));
}

export function movableOnDay<T extends MovableTx>(
  transactions: T[],
  date: string,
  canMove: (tx: T) => boolean,
): T[] {
  return transactions.filter((tx) => dayOf(tx.date) === date && canMove(tx));
}
