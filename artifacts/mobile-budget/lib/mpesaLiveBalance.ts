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

/**
 * "Find the difference": what is sent to the server for each message is only
 * its receipt code, the balance it states and when it came - never the message.
 */
export type DifferenceMessage = { receipt: string | null; balance: number; at: number; day: string };

/** M-Pesa's receipt code, which every transaction message starts with ("TJ4AB1CD2E Confirmed…"). */
export function receiptOf(body: string): string | null {
  const code = body.trim().match(/^([A-Z0-9]{8,15})\b/)?.[1];
  return code && /[A-Z]/.test(code) && /[0-9]/.test(code) ? code : null;
}

/** A moment's day in Kenya (UTC+3 all year), as YYYY-MM-DD: the day Jamvi dates entries by. */
export const kenyaDay = (ms: number): string => new Date(ms + 3 * 3_600_000).toISOString().slice(0, 10);

/** The messages that state a balance, as the server is sent them. */
export function differenceMessages(rows: ReadonlyArray<{ body: string; date: number }>): DifferenceMessage[] {
  const out: DifferenceMessage[] = [];
  for (const row of rows) {
    const balance = balanceInMessage(row.body);
    if (balance === null) continue;
    out.push({ receipt: receiptOf(row.body), balance, at: row.date, day: kenyaDay(row.date) });
  }
  return out;
}

/** "Jamvi fell KES 2,000 below M-Pesa" / "went KES 500 above". */
export function spanChangeText(change: number): string {
  return change > 0
    ? `Jamvi fell ${kes(change)} further below M-Pesa`
    : `Jamvi went ${kes(Math.abs(change))} further above M-Pesa`;
}

/**
 * A gap already there on the first day the messages cover is a starting
 * balance Jamvi was never told: the opening balance that closes it.
 */
export function startingBalanceAdvice(startGap: number, opening: number, account: string, firstDay: string): string | null {
  if (Math.abs(startGap) < 1) return null;
  const needed = Math.round((opening + startGap) * 100) / 100;
  if (needed < 0) {
    return `On ${firstDay}, when your messages begin, Jamvi already had ${kes(Math.abs(startGap))} more in ${account} than M-Pesa did: something before then was counted twice or saved to ${account} by mistake.`;
  }
  return `On ${firstDay}, when your messages begin, Jamvi was already ${kes(Math.abs(startGap))} ${startGap > 0 ? 'below' : 'above'} M-Pesa. `
    + `That is what ${account} held before Jamvi's records start: set its opening balance to ${kes(needed)} in Bank.`;
}
