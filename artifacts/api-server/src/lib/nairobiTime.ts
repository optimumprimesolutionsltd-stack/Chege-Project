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
