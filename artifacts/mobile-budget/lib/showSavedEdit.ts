/**
 * An edit shows on the list the moment it saves.
 *
 * Saving an edit on Bank only marked the account stale, so the row kept its old
 * title - "Not sure yet" - until the whole account had been fetched again, which
 * on a long M-Pesa account takes a while ("when I make changes, they don't
 * reflect immediately. Not sure yet stays for a long time", 8 Oct 2026). The
 * server answers the save with the row as it now is; this puts that row into
 * every cached copy of the account straight away. The refetch still follows
 * and has the last word on balances and totals.
 */

type Row = { id: number };
type Ledger = { transactions?: Row[] };

/** The cached account with `saved` in place of the row it updates, or the same object when it has no such row. */
export function withSavedRow<T>(cached: T, saved: Row): T {
  const ledger = cached as unknown as Ledger | undefined;
  const rows = ledger?.transactions;
  if (!Array.isArray(rows)) return cached;
  const at = rows.findIndex((row) => row.id === saved.id);
  if (at === -1) return cached;
  const next = rows.slice();
  next[at] = { ...rows[at], ...saved };
  return { ...(cached as object), transactions: next } as T;
}

/**
 * Lists that show an entry's category or whether it still needs sorting:
 * refreshed after an edit as well as the balance screens. Bank's edit used to
 * leave Sort them out and Home's count on the old answer for up to a minute.
 */
export const LISTS_AN_EDIT_CHANGES: ReadonlyArray<readonly unknown[]> = [
  ['entries-to-sort'],
  ['/api/dashboard/expense-ledger'],
  ['/api/dashboard/category-ledger'],
  ['/api/dashboard/activity'],
  ['/api/dashboard/category-breakdown'],
];

/** The cached Sort them out list without the entries just sorted. */
export function withoutSorted<T extends { entries: Array<{ id: number }> }>(cached: T | undefined, sortedIds: readonly number[]): T | undefined {
  if (!cached || !Array.isArray(cached.entries)) return cached;
  const gone = new Set(sortedIds);
  return { ...cached, entries: cached.entries.filter((entry) => !gone.has(entry.id)) };
}
