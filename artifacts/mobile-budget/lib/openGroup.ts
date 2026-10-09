/**
 * An open group on All expenses (By category, By item).
 *
 * Opening "Not sure yet" drew every entry in it at once - hundreds, after a year
 * of M-Pesa - and the screen lagged on every tap ("in the all expenses tab, by
 * category is also lagging trying to do any editing", 9 Oct 2026). By date
 * already shows a page at a time (lib/progressiveDays); a group now does too.
 */
export const GROUP_ROWS_STEP = 40;

/** How many of a group's rows to draw, given how many times "show more" was tapped. */
export function groupRowsShown(total: number, more: number): number {
  return Math.min(total, GROUP_ROWS_STEP * (1 + Math.max(0, more)));
}

/**
 * The bank and M-Pesa accounts a group's entries sit in. Editing one opens it on
 * Bank, on its own account, which needs that account's whole history first -
 * seconds on a year of M-Pesa. Fetched as the group opens, it is usually there
 * by the time an entry is tapped.
 */
export function accountsOf(rows: ReadonlyArray<{ source?: string; accountId?: number | null }>): number[] {
  const ids = new Set<number>();
  for (const row of rows) {
    if (row.source === 'bank_disbursement' && typeof row.accountId === 'number' && row.accountId > 0) ids.add(row.accountId);
  }
  return [...ids];
}
