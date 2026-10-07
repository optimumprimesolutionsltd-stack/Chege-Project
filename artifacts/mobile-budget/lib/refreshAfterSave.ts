import type { QueryClient } from '@tanstack/react-query';

/**
 * What a save refreshes.
 *
 * Every save used to refetch every query in the app (invalidateQueries() with no
 * filter). Tab screens stay mounted, so Home, Bank, Budget and Reports all
 * reloaded behind the screen in use - each of them downloading the whole M-Pesa
 * and bank history again, a megabyte or more for a year of entries. Filing
 * twenty entries in Sort them out was twenty of those bursts (lag audit, 7 Oct
 * 2026).
 *
 * Now the small queries - totals, categories, counts - still refresh at once,
 * so nothing shows an old name or figure. The history lists are only marked out
 * of date, and are fetched again when a screen showing one comes into view
 * (refreshShownHistory). Screens that save into a history refresh it themselves.
 */

/** The queries that download a whole history: the account ledger and the ledgers built from it. */
const HISTORY_KEYS = new Set([
  '/api/joint-account',
  'joint-account',
  '/api/dashboard/expense-ledger',
  '/api/dashboard/income-ledger',
  '/api/dashboard/category-ledger',
]);

export const isHistoryQuery = (queryKey: readonly unknown[]): boolean =>
  typeof queryKey[0] === 'string' && HISTORY_KEYS.has(queryKey[0]);

export function refreshAfterSave(client: QueryClient): void {
  void client.invalidateQueries({ predicate: (query) => !isHistoryQuery(query.queryKey) });
  void client.invalidateQueries({ predicate: (query) => isHistoryQuery(query.queryKey), refetchType: 'none' });
}

/** On moving to another screen: any history on display that a save left out of date. */
export function refreshShownHistory(client: QueryClient): void {
  void client.refetchQueries({ predicate: (query) => isHistoryQuery(query.queryKey), type: 'active', stale: true });
}
