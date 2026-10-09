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
/**
 * `record: false` marks a message that moves the balance but is never saved as
 * an entry of its own (a Fuliza loan notice or repayment): not "missing".
 */
export type DifferenceMessage = { receipt: string | null; balance: number; at: number; day: string; record?: false };

/** M-Pesa's receipt code, which every transaction message starts with ("TJ4AB1CD2E Confirmed…"). */
export function receiptOf(body: string): string | null {
  const code = body.trim().match(/^([A-Z0-9]{8,15})\b/)?.[1];
  return code && /[A-Z]/.test(code) && /[0-9]/.test(code) ? code : null;
}

/** A moment's day in Kenya (UTC+3 all year), as YYYY-MM-DD: the day Jamvi dates entries by. */
export const kenyaDay = (ms: number): string => new Date(ms + 3 * 3_600_000).toISOString().slice(0, 10);

const FULIZA_NOTICE = /Fuliza\s+M-?PESA\s+amount\s+is\s+Ksh/i;
const FULIZA_OUTSTANDING = /Total\s+Fuliza\s+M-?PESA\s+outstanding\s+amount\s+is\s+Ksh\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
const FULIZA_REPAYMENT = /has\s+been\s+used\s+to\s+(fully|partially|partly)\s+(?:re)?pay\s+(?:your\s+)?outstanding\s+Fuliza/i;
const FIRST_AMOUNT = /Ksh\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
const amountOf = (text: string | undefined) => (text ? Number(text.replace(/,/g, '')) : NaN);
const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * The messages that state a balance, as the server is sent them.
 *
 * Fuliza is counted in: a payment Fuliza covered is saved in full while
 * M-Pesa's balance stops at nothing, and paying the loan back takes money from
 * M-Pesa that is never saved as spending. So the balance sent is M-Pesa's less
 * the Fuliza still owed - what Jamvi's own figure shows - and the loan notices
 * and repayments are sent as `record: false`: they move the balance, but there
 * is nothing in them to bring in (Fix all once brought them in and saved
 * nothing, 5 Oct 2026).
 */
export function differenceMessages(rows: ReadonlyArray<{ body: string; date: number }>): DifferenceMessage[] {
  const out: DifferenceMessage[] = [];
  let owed = 0;
  let last: number | null = null;
  for (const row of [...rows].sort((a, b) => a.date - b.date)) {
    const receipt = receiptOf(row.body);
    const stated = balanceInMessage(row.body);
    const repaid = row.body.match(FULIZA_REPAYMENT);
    if (FULIZA_NOTICE.test(row.body) || repaid) {
      if (repaid) {
        owed = repaid[1].toLowerCase() === 'fully' ? 0 : Math.max(0, cents(owed - (amountOf(row.body.match(FIRST_AMOUNT)?.[1]) || 0)));
      } else {
        const total = amountOf(row.body.match(FULIZA_OUTSTANDING)?.[1]);
        if (Number.isFinite(total)) owed = total;
      }
      if (stated !== null) last = stated;
      if (last !== null) out.push({ receipt, balance: cents(last - owed), at: row.date, day: kenyaDay(row.date), record: false });
      continue;
    }
    if (stated === null) continue;
    last = stated;
    out.push({ receipt, balance: cents(stated - owed), at: row.date, day: kenyaDay(row.date) });
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
/**
 * The opening balance that makes Jamvi start level with M-Pesa, for the one-tap
 * fix ("it does not tell me a way of resolving it or ask if it can resolve it on
 * my behalf", 9 Oct 2026). None when there is no gap, or when Jamvi was already
 * above M-Pesa: then something before was counted twice, and no opening balance
 * can be below nothing.
 */
export function openingBalanceFix(startGap: number, opening: number): number | null {
  if (Math.abs(startGap) < 1) return null;
  const needed = Math.round((opening + startGap) * 100) / 100;
  return needed < 0 ? null : needed;
}

export function startingBalanceAdvice(startGap: number, opening: number, account: string, firstDay: string): string | null {
  if (Math.abs(startGap) < 1) return null;
  const needed = Math.round((opening + startGap) * 100) / 100;
  if (needed < 0) {
    return `On ${firstDay}, when your messages begin, Jamvi already had ${kes(Math.abs(startGap))} more in ${account} than M-Pesa did: something before then was counted twice or saved to ${account} by mistake.`;
  }
  return `On ${firstDay}, when your messages begin, Jamvi was already ${kes(Math.abs(startGap))} ${startGap > 0 ? 'below' : 'above'} M-Pesa. `
    + `That is what ${account} held before Jamvi's records start: set its opening balance to ${kes(needed)} in Bank.`;
}

/** One day the check found, as the server sends it. */
export type DifferenceSpan = {
  from: string;
  to: string;
  change: number;
  missing: Array<{ receipt: string; day: string; savedIn: string | null; savedOn: string | null }>;
  extra: Array<{ id: number; date: string; amount: number; description: string; receipt: string | null }>;
  redated: Array<{ id: number; receipt: string; messageDay: string; savedDate: string; amount: number; description: string }>;
  /** Saved, on the right day, for a different amount than the balance moved: most often a charge never saved. */
  amounts?: Array<{ receipt: string; day: string; entryId: number; description: string; inMessages: number; inJamvi: number }>;
};

const TRANSACTION_COST = /transaction\s+cost,?\s*(?:ksh|kes)\.?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;

/** The charge an M-Pesa message states ("Transaction cost, Ksh7.00"), or null. */
export function statedCharge(body: string | undefined): number | null {
  const found = body?.match(TRANSACTION_COST)?.[1];
  if (!found) return null;
  const value = Number(found.replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

/**
 * The M-Pesa charge a payment is missing - only the one its own message
 * states, and only when that is exactly what Jamvi is short. Worked out from
 * the balance alone it once added 137 "charges" of up to KES 3,829 where
 * messages were not on the phone (5 Oct 2026). Null for anything else, which
 * is left to look at.
 */
export function missingCharge(item: { inMessages: number; inJamvi: number }, stated: number | null): number | null {
  if (stated === null || stated < 1 || item.inJamvi >= 0) return null;
  const short = Math.round((item.inJamvi - item.inMessages) * 100) / 100;
  return Math.abs(short - stated) < 0.5 ? stated : null;
}

export type FixPlan = {
  /** Saved to another account: moved to the M-Pesa account. */
  move: string[];
  /** Saved under another day: given the message's day. */
  redate: Array<{ id: number; date: string }>;
  /** Not saved anywhere: brought in, as Not sure yet, from these days. */
  bringIn: { count: number; from: string; to: string } | null;
  /** In the account but in none of the messages: never touched, left to look at. */
  leftToCheck: number;
  /** M-Pesa charges the balance shows were taken but never saved: added to their payment. */
  charges: Array<{ entryId: number; amount: number }>;
};

/**
 * "Fix all": everything the check found that can be put right without a
 * person's judgement, done after one confirmation. An entry in none of the
 * messages may be cash or typed on purpose, so it is never deleted - only
 * counted, to be looked at.
 */
export function fixPlan(spans: readonly DifferenceSpan[], chargeOf: (receipt: string) => number | null = () => null): FixPlan {
  const move = new Set<string>();
  const redate = new Map<number, string>();
  let count = 0;
  let from: string | null = null;
  let to: string | null = null;
  let leftToCheck = 0;
  const charges = new Map<number, number>();
  for (const span of spans) {
    for (const item of span.amounts ?? []) {
      const charge = missingCharge(item, chargeOf(item.receipt));
      if (charge !== null) charges.set(item.entryId, charge);
      else leftToCheck += 1;
    }
    for (const item of span.missing) {
      if (item.savedIn) move.add(item.receipt);
      else {
        count += 1;
        if (!from || span.from < from) from = span.from;
        if (!to || span.to > to) to = span.to;
      }
    }
    for (const item of span.redated) redate.set(item.id, item.messageDay);
    leftToCheck += span.extra.length;
  }
  return {
    move: [...move],
    redate: [...redate].map(([id, date]) => ({ id, date })),
    bringIn: count > 0 && from && to ? { count, from, to } : null,
    leftToCheck,
    charges: [...charges].map(([entryId, amount]) => ({ entryId, amount })),
  };
}

export const hasFixes = (plan: FixPlan): boolean => plan.move.length > 0 || plan.redate.length > 0 || plan.bringIn !== null || plan.charges.length > 0;

/** The one confirmation: what will change, and what will not. */
export function fixConfirmation(plan: FixPlan, account: string): { title: string; message: string } {
  const parts: string[] = [];
  if (plan.bringIn) parts.push(`Bring in ${plan.bringIn.count} payment${plan.bringIn.count === 1 ? '' : 's'} not saved anywhere, as Not sure yet - you say what each was for later, in Sort them out.`);
  if (plan.move.length > 0) parts.push(`Move ${plan.move.length} saved in another account to ${account}.`);
  if (plan.charges.length > 0) {
    const total = plan.charges.reduce((sum, charge) => sum + charge.amount, 0);
    parts.push(`Add ${plan.charges.length} M-Pesa charge${plan.charges.length === 1 ? '' : 's'} M-Pesa took but Jamvi never saved (${kes(total)} in all), each to its payment.`);
  }
  if (plan.redate.length > 0) parts.push(`Give ${plan.redate.length} ${plan.redate.length === 1 ? 'entry' : 'entries'} the day of ${plan.redate.length === 1 ? 'its' : 'their'} M-Pesa message.`);
  const left = plan.leftToCheck > 0
    ? `\n\nNothing is deleted. ${plan.leftToCheck} ${plan.leftToCheck === 1 ? 'entry' : 'entries'} in ${account} that ${plan.leftToCheck === 1 ? 'is' : 'are'} in none of your messages ${plan.leftToCheck === 1 ? 'stays' : 'stay'} for you to look at: ${plan.leftToCheck === 1 ? 'it may be' : 'they may be'} cash, or saved twice.`
    : '\n\nNothing is deleted.';
  return { title: 'Fix all of these?', message: `${parts.map((part) => `• ${part}`).join('\n')}${left}` };
}

/**
 * The year being worked on: "I want to work with 2026 only" (4 Oct 2026).
 * Find the difference and Find money in with no source both start on 1
 * January of this year, by Kenya's calendar; earlier years are left as they are.
 */
export function workingYear(now = Date.now()): { year: number; from: string; days: number } {
  const year = Number(kenyaDay(now).slice(0, 4));
  const from = `${year}-01-01`;
  // Days to read back: from midnight on 1 January in Kenya (UTC+3), plus one
  // spare, and anything before it is dropped by `inWorkingYear`.
  const start = Date.UTC(year, 0, 1) - 3 * 3_600_000;
  return { year, from, days: Math.ceil((now - start) / 86_400_000) + 1 };
}

/** Keeps only the messages from 1 January of the working year on. */
export function inWorkingYear<T extends { date: number }>(rows: readonly T[], from: string): T[] {
  return rows.filter((row) => kenyaDay(row.date) >= from);
}
