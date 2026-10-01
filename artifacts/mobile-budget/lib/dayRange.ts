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

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * A whole calendar month as a range: its 1st to its last day, or to today
 * while it is still the current month - the ranges never reach the future.
 * `month` is 1-12; a month past 12 or before 1 rolls into the next or last year.
 */
export function monthRange(year: number, month: number, today: string = isoDay(new Date())): { from: string; to: string } {
  const first = new Date(year, month - 1, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const from = isoDay(first);
  const end = isoDay(last);
  return { from, to: end > today && from <= today ? today : end };
}

/** The month a range covers exactly (as monthRange draws it), or null for any other stretch of days. */
export function wholeMonthOf(from: string, to: string, today: string = isoDay(new Date())): { year: number; month: number } | null {
  const year = Number(from.slice(0, 4));
  const month = Number(from.slice(5, 7));
  if (!year || !month || from.slice(8, 10) !== '01') return null;
  const range = monthRange(year, month, today);
  return range.from === from && range.to === to ? { year, month } : null;
}

/** The month before or after the one `from` falls in, as a range. */
export function stepMonth(from: string, delta: number, today: string = isoDay(new Date())): { from: string; to: string } {
  return monthRange(Number(from.slice(0, 4)), Number(from.slice(5, 7)) + delta, today);
}
