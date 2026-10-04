/**
 * The live M-Pesa balance, worked out from M-Pesa's own messages, and what to
 * say about Jamvi's figure beside it. Plain functions, so they can be tested
 * without the phone (lib/mpesaSms.ts does the reading).
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const kes = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;

/**
 * The live M-Pesa balance: every M-Pesa message ends "New M-PESA balance is
 * Ksh…", so the newest one that says it is what the M-Pesa app would show.
 * Jamvi's own figure is worked out from what was recorded, and drifts when
 * money in was never recorded or there is no opening balance - asked for on
 * 4 Oct 2026, with Jamvi showing KES -324,188 for an account that cannot go
 * below nothing.
 */
const BALANCE = /\bm[- ]?pesa(?:\s+account)?\s+balance(?:\s+is|\s+was)?\s*:?\s*(?:ksh|kes)\.?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;

/** The M-Pesa balance a message states, or null when it states none. */
export function balanceInMessage(body: string): number | null {
  const found = body.match(BALANCE)?.[1];
  if (!found) return null;
  const value = Number(found.replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

export type LiveBalance = { balance: number; at: number };

/** The balance in the newest message that states one. */
export function latestBalance(rows: ReadonlyArray<{ body: string; date: number }>): LiveBalance | null {
  let best: LiveBalance | null = null;
  for (const row of rows) {
    if (best && row.date <= best.at) continue;
    const balance = balanceInMessage(row.body);
    if (balance !== null) best = { balance, at: row.date };
  }
  return best;
}

/**
 * Jamvi's figure against M-Pesa's: null when they agree to the shilling, else
 * how far apart and which way. Positive means M-Pesa holds more than Jamvi has.
 */
export function balanceGap(live: number, inJamvi: number): number | null {
  const gap = Math.round((live - inJamvi) * 100) / 100;
  return Math.abs(gap) < 1 ? null : gap;
}

/** "4 Oct, 3:12 PM": when the message carrying the live balance arrived. */
export const messageTime = (ms: number) => {
  const at = new Date(ms);
  const hour = at.getHours() % 12 || 12;
  const minute = String(at.getMinutes()).padStart(2, '0');
  return `${at.getDate()} ${MONTHS[at.getMonth()].slice(0, 3)}, ${hour}:${minute} ${at.getHours() < 12 ? 'AM' : 'PM'}`;
};

/** What the card says under the live balance about Jamvi's own figure. */
export function balanceComparison(live: number, inJamvi: number, account: string | null | undefined): { agrees: boolean; text: string } {
  const name = account || 'M-Pesa';
  const gap = balanceGap(live, inJamvi);
  if (gap === null) return { agrees: true, text: `Jamvi agrees: ${name} is ${kes(inJamvi)} in Jamvi too.` };
  return {
    agrees: false,
    text: `${name} in Jamvi: ${kes(inJamvi)}, ${kes(Math.abs(gap))} ${gap > 0 ? 'less' : 'more'} than M-Pesa. `
      + `Some money ${gap > 0 ? 'in' : 'out'} was not recorded in ${name}, or its opening balance is missing.`,
  };
}
