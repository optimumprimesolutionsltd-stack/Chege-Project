/**
 * "Find the difference": why Jamvi's M-Pesa figure is not M-Pesa's.
 *
 * Every M-Pesa message states the balance right after it ("New M-PESA balance
 * is Ksh…"). The phone sends, for each message, only its receipt code, that
 * balance and when it came - never the message itself. Here they are laid
 * against the M-Pesa account's entries in Jamvi, day by day:
 *
 * - M-Pesa's balance at the end of a day is the balance in that day's last
 *   message; Jamvi's is the opening balance plus every entry dated that day or
 *   earlier (as lib/mpesa-balance.ts counts it).
 * - The gap between them is worked out for every day that has a message. Where
 *   the gap changes from one such day to the next, something between them was
 *   recorded differently, and the entries of those days say what: a payment
 *   M-Pesa has that this account does not (perhaps saved to another account),
 *   an entry here that no message has (typed by hand, or saved twice), or one
 *   saved under a different date.
 * - The gap on the first day is the starting balance: what M-Pesa held before
 *   the messages begin that Jamvi was not told about.
 *
 * Asked for on 4 Oct 2026: Jamvi showed KES -324,188 for an account that cannot
 * go below nothing, though every message had been saved.
 */

export type DifferenceMessage = {
  receipt: string | null;
  /** The balance the message states, after its own payment. */
  balance: number;
  /** When it arrived, in milliseconds - orders a day's messages. */
  at: number;
  /** Its day in Kenya, as YYYY-MM-DD. */
  day: string;
  /**
   * false: it moves the balance but is never an entry of its own (a Fuliza
   * loan notice or repayment), so it is never "missing".
   */
  record?: boolean;
};

export type LedgerEntry = {
  id: number;
  date: string;
  /** Money in positive, money out negative. */
  signed: number;
  receipt: string | null;
  description: string;
  /**
   * The payment's code for an entry that belongs to one without carrying it:
   * its M-Pesa charge, or a Fuliza access fee ("<code>FEE").
   */
  covers?: string | null;
};

export type ProblemSpan = {
  /** The day after the last day that agreed, and the day the gap is seen to have moved. */
  from: string;
  to: string;
  /** How far the gap moved: positive means Jamvi fell further below M-Pesa. */
  change: number;
  /** In M-Pesa's messages for these days but not in this account. */
  missing: Array<{ receipt: string; day: string; savedIn: string | null; savedOn: string | null }>;
  /** In this account for these days, but in none of the messages. */
  extra: Array<{ id: number; date: string; amount: number; description: string; receipt: string | null }>;
  /** In both, but saved under a different day from its message, so it lands on the wrong side of a day. */
  redated: Array<{ id: number; receipt: string; messageDay: string; savedDate: string; amount: number; description: string }>;
  /**
   * In both, on the right day, but for a different amount: the balance moved
   * by `inMessages` with this payment and its charges, and Jamvi has
   * `inJamvi`. Most often an M-Pesa charge never saved. `entryId` is the
   * payment's own entry, for adding the charge to.
   */
  amounts?: Array<{ receipt: string; day: string; entryId: number; description: string; inMessages: number; inJamvi: number }>;
};

export type DifferenceResult = {
  from: string;
  to: string;
  checkedDays: number;
  /** The gap on the first day the messages cover: a starting balance Jamvi lacks. */
  startGap: number;
  /** The gap on the last day: what is still out today. */
  endGap: number;
  spans: ProblemSpan[];
  /** More spans than are listed. */
  moreSpans: number;
};

const round = (value: number) => Math.round(value * 100) / 100;
const MAX_SPANS = 60;
const MAX_ITEMS = 40;

/**
 * Lays the messages against the account. `elsewhere` says, for a receipt not in
 * this account, which other account (and day) it was saved to, if any.
 */
export function findDifference(
  messages: readonly DifferenceMessage[],
  ledger: readonly LedgerEntry[],
  openingBalance: number,
  elsewhere: ReadonlyMap<string, { account: string; date: string }> = new Map(),
): DifferenceResult | null {
  const withBalance = messages.filter((message) => Number.isFinite(message.balance));
  if (withBalance.length === 0) return null;

  // M-Pesa's end-of-day balance: the balance in each day's last message.
  const lastOfDay = new Map<string, DifferenceMessage>();
  for (const message of withBalance) {
    const kept = lastOfDay.get(message.day);
    if (!kept || message.at >= kept.at) lastOfDay.set(message.day, message);
  }
  const days = [...lastOfDay.keys()].sort();

  // Jamvi's end-of-day balance on each of those days.
  const entries = [...ledger].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
  const jamviOn = new Map<string, number>();
  let running = openingBalance;
  let next = 0;
  for (const day of days) {
    while (next < entries.length && entries[next].date <= day) running += entries[next++].signed;
    jamviOn.set(day, round(running));
  }
  const gapOn = (day: string) => round(lastOfDay.get(day)!.balance - jamviOn.get(day)!);

  const ledgerReceipts = new Map<string, LedgerEntry>();
  for (const entry of ledger) if (entry.receipt) ledgerReceipts.set(entry.receipt, entry);
  const messageDay = new Map<string, string>();
  // A Fuliza notice shares its payment's code: the payment's own day wins.
  for (const message of withBalance) {
    if (message.receipt && (message.record !== false || !messageDay.has(message.receipt))) messageDay.set(message.receipt, message.day);
  }
  const messageReceipts = new Set(messageDay.keys());

  // What each payment did to the balance: the change from the message before
  // it, summed over every message carrying its code (a Fuliza notice shares
  // its payment's). And what Jamvi has for it: the entry and its charges.
  const ordered = withBalance.map((message, index) => ({ message, index }))
    .sort((a, b) => a.message.at - b.message.at || a.index - b.index)
    .map(({ message }) => message);
  const movedBy = new Map<string, number>();
  for (let i = 1; i < ordered.length; i += 1) {
    const code = ordered[i].receipt;
    if (!code) continue;
    movedBy.set(code, round((movedBy.get(code) ?? 0) + ordered[i].balance - ordered[i - 1].balance));
  }
  const savedFor = new Map<string, number>();
  for (const entry of entries) {
    const code = entry.receipt && messageReceipts.has(entry.receipt) ? entry.receipt : entry.covers;
    if (code) savedFor.set(code, round((savedFor.get(code) ?? 0) + entry.signed));
  }
  const firstCode = ordered[0]?.receipt ?? null;

  const all: ProblemSpan[] = [];
  for (let i = 1; i < days.length; i += 1) {
    const change = round(gapOn(days[i]) - gapOn(days[i - 1]));
    if (Math.abs(change) < 1) continue;
    const after = days[i - 1];
    const upTo = days[i];
    const inSpan = (day: string) => day > after && day <= upTo;
    const missing = withBalance
      .filter((message) => message.record !== false && message.receipt && inSpan(message.day) && !ledgerReceipts.has(message.receipt))
      .map((message) => {
        const other = elsewhere.get(message.receipt!);
        return { receipt: message.receipt!, day: message.day, savedIn: other?.account ?? null, savedOn: other?.date ?? null };
      });
    const extra = entries
      .filter((entry) => inSpan(entry.date) && !(entry.receipt && messageReceipts.has(entry.receipt)) && !(entry.covers && messageReceipts.has(entry.covers)))
      .map((entry) => ({ id: entry.id, date: entry.date, amount: entry.signed, description: entry.description, receipt: entry.receipt }));
    const redated = entries
      .filter((entry) => {
        if (!entry.receipt) return false;
        const sent = messageDay.get(entry.receipt);
        return sent !== undefined && inSpan(sent) !== inSpan(entry.date) && (inSpan(sent) || inSpan(entry.date));
      })
      .map((entry) => ({ id: entry.id, receipt: entry.receipt!, messageDay: messageDay.get(entry.receipt!)!, savedDate: entry.date, amount: entry.signed, description: entry.description }));
    all.push({
      from: nextDay(after),
      to: upTo,
      change,
      missing: dedupe(missing, (item) => item.receipt).slice(0, MAX_ITEMS),
      extra: extra.slice(0, MAX_ITEMS),
      redated: redated.slice(0, MAX_ITEMS),
      amounts: dedupe(
        withBalance.filter((message) => message.record !== false && message.receipt && message.receipt !== firstCode && inSpan(message.day) && ledgerReceipts.has(message.receipt) && movedBy.has(message.receipt)),
        (message) => message.receipt!,
      )
        .filter((message) => Math.abs(movedBy.get(message.receipt!)! - (savedFor.get(message.receipt!) ?? 0)) >= 1)
        .map((message) => {
          const entry = ledgerReceipts.get(message.receipt!)!;
          return { receipt: message.receipt!, day: message.day, entryId: entry.id, description: entry.description, inMessages: movedBy.get(message.receipt!)!, inJamvi: savedFor.get(message.receipt!) ?? 0 };
        })
        .slice(0, MAX_ITEMS),
    });
  }

  // Biggest first: the few days that make up most of the gap, not a run of
  // shillings at the start of the year ("biggest first", 5 Oct 2026). Equal
  // ones stay in date order.
  const ranked = all.map((span, index) => ({ span, index }))
    .sort((a, b) => Math.abs(b.span.change) - Math.abs(a.span.change) || a.index - b.index)
    .map(({ span }) => span);
  const spans = ranked.slice(0, MAX_SPANS);
  const moreSpans = ranked.length - spans.length;

  return {
    from: days[0],
    to: days[days.length - 1],
    checkedDays: days.length,
    startGap: gapOn(days[0]),
    endGap: gapOn(days[days.length - 1]),
    spans,
    moreSpans,
  };
}

function dedupe<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The day after a YYYY-MM-DD day. */
export function nextDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}
