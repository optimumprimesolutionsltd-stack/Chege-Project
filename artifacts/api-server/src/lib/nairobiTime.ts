/**
 * "Now", as Kenyan wall-clock time, regardless of the server process's own
 * timezone — Render runs in UTC, three hours behind Nairobi.
 *
 * Mirrors the shift mpesa.ts's darajaTimestamp() already applies for
 * Safaricom's timestamp format. Read the result with UTC getters
 * (getUTCMonth, getUTCFullYear, ...), never the local ones — the local
 * getters would apply whatever timezone the process happens to be running
 * in on top of this shift, double-counting it everywhere except a server
 * that is itself already UTC.
 *
 * Matters only for the few hours either side of Nairobi midnight, and only
 * when a caller omits an explicit month/year rather than sending one — but
 * in that window it decided the wrong calendar month, right at the moment a
 * month actually turns over.
 */
const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;

export function nairobiNow(): Date {
  return new Date(Date.now() + NAIROBI_OFFSET_MS);
}

/** The current month (1-12) and year in Nairobi, for defaulting a "which
 *  month" query param nobody supplied explicitly. */
export function currentNairobiMonthYear(): { month: number; year: number } {
  const now = nairobiNow();
  return { month: now.getUTCMonth() + 1, year: now.getUTCFullYear() };
}

/**
 * The midnight in Nairobi that ends the day `at` falls on - or `at` itself
 * when it already is one. A trial, a paid month or a grace period ends at the
 * end of its last day, as a person counts days; it used to end at the time of
 * day they happened to sign up or pay, so "2 days left" ran out mid-afternoon.
 */
export function endOfNairobiDay(at: Date): Date {
  const shifted = new Date(at.getTime() + NAIROBI_OFFSET_MS);
  if (shifted.getUTCHours() === 0 && shifted.getUTCMinutes() === 0 && shifted.getUTCSeconds() === 0 && shifted.getUTCMilliseconds() === 0) {
    return at;
  }
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + 1) - NAIROBI_OFFSET_MS);
}

/** endOfNairobiDay for a date that may be missing. */
export const endOfNairobiDayOrNull = (at: Date | null): Date | null => (at ? endOfNairobiDay(at) : null);
