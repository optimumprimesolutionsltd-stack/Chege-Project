/**
 * Whole calendar months as From/To ranges, for the month stepper above a pair
 * of dates - the same rules as the phone (mobile-budget lib/dayRange.ts).
 */

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** A date as YYYY-MM-DD in this device's own timezone. */
export function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * A month as a range: its 1st to its last day, or to today while it is still
 * the current month - never into the future. `month` is 1-12, and rolls into
 * the next or last year past either end.
 */
export function monthRange(year: number, month: number, today: string = isoDay(new Date())): { from: string; to: string } {
  const first = new Date(year, month - 1, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const from = isoDay(first);
  const end = isoDay(last);
  return { from, to: end > today && from <= today ? today : end };
}

/** The month a range covers exactly (as monthRange draws it), or null for any other stretch. */
export function wholeMonthOf(from: string, to: string, today: string = isoDay(new Date())): { year: number; month: number } | null {
  const year = Number(from.slice(0, 4));
  const month = Number(from.slice(5, 7));
  if (!year || !month || from.slice(8, 10) !== "01") return null;
  const range = monthRange(year, month, today);
  return range.from === from && range.to === to ? { year, month } : null;
}

/** The month before or after the one `from` falls in, as a range. */
export function stepMonth(from: string, delta: number, today: string = isoDay(new Date())): { from: string; to: string } {
  return monthRange(Number(from.slice(0, 4)), Number(from.slice(5, 7)) + delta, today);
}
