/**
 * Day-range helpers shared by the screens that let someone pick an exact
 * stretch of days — the Contributions "Expected vs actual" card and the
 * Reports PDF export. Both send `?from=&to=` as plain YYYY-MM-DD.
 */

/** A date as YYYY-MM-DD in the device's own timezone, which is the day the
 *  person believes they picked. Building it from the UTC parts instead would
 *  hand back the previous day for anyone behind UTC. */
export function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** The first day of the current month, the natural start for "so far". */
export function monthStartIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

/** "15 Sep 2026" — for a picker button, not for the report's own heading. */
export function longDay(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The two ends in order, so a range picked backwards still reads forwards. */
export function orderedRange(from: string, to: string): [string, string] {
  return from <= to ? [from, to] : [to, from];
}
