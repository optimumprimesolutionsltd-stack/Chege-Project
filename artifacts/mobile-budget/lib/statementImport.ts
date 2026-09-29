import type { PreviewLine } from './mpesaImport';
import type { StatementRow } from './statementTable';

/**
 * Turns the rows of an M-Pesa statement into the same review lines a pasted
 * message becomes, so the two share one screen, one set of choices and one way
 * of saving.
 *
 * What the statement holds that a paste does not:
 *  - a Fuliza loan draw ('OverDraft of Credit Party') and the repayment of it
 *    ('OD Loan Repayment'). Neither is spending or income: what the loan bought
 *    is the payment beside it, which is recorded as an ordinary payment. Both
 *    are counted and left out.
 *  - a charge printed as a row of its own next to its payment, folded into that
 *    payment's fee, as a pasted message's 'transaction cost' is.
 *
 * Nothing is guessed: wording that is not recognised is left out with a reason,
 * to be recorded by hand.
 */
export interface StatementReading {
  lines: PreviewLine[];
  loanDraws: number;
  loanRepayments: number;
  /** What the loan draws added to the balance, and what the repayments took off it. */
  loanDrawTotal: number;
  loanRepaymentTotal: number;
  /** The net effect on the balance of entries left out with a reason (reversals, unrecognised, lone charges). */
  leftOutNet: number;
  /** The statement's balance before its first entry and after its last; null when it cannot be worked out. */
  opening: number | null;
  closing: number | null;
  /**
   * Fuliza, split. The fees are what was repaid above what was drawn, on the
   * loans the last repayment cleared; what was drawn after it is still owed at
   * the end - borrowed, so not income - and is listed as a line of its own so
   * the account ends where M-Pesa's balance does.
   */
  fulizaFee?: number;
  loanOwedAtEnd?: number;
  /** A Fuliza balance owed from an earlier statement, repaid in this one. */
  loanOwedAtStart?: number;
  /** Draws and repayments no line accounts for; 0 when the split above covers them. */
  loanLeftOut?: number;
  /** The first and last day the statement has entries for; null when it has none. */
  firstDate?: string | null;
  lastDate?: string | null;
}

const DRAW = /^OverDraft of Credit Party/i;
const REPAYMENT = /^OD Loan Repayment/i;
const CHARGE = /\bCharge$/i;
const REVERSAL = /\bReversal\b/i;

type Kind = 'person_payment' | 'merchant_payment' | 'paybill_payment' | 'airtime_purchase' | 'cash_withdrawal' | 'person_receipt' | 'bank_receipt';

const KINDS: Array<[RegExp, Kind, 'out' | 'in']> = [
  [/^Customer Bundle Purchase/i, 'airtime_purchase', 'out'],
  [/^Customer (?:Transfer|Send Money)/i, 'person_payment', 'out'],
  // Pochi la Biashara: paying a small business on its phone number.
  [/^Customer Payment to Small Business/i, 'person_payment', 'out'],
  [/^Merchant Payment/i, 'merchant_payment', 'out'],
  [/^Pay Bill/i, 'paybill_payment', 'out'],
  [/^Customer Withdrawal/i, 'cash_withdrawal', 'out'],
  [/^Transfer from Bank/i, 'bank_receipt', 'in'],
  [/^(?:Business Payment from|Funds received from|Promotion Payment from|Salary Payment from|Transfer from Archived Funds)/i, 'person_receipt', 'in'],
];

const titleCase = (value: string) =>
  value
    .toLocaleLowerCase('en-KE')
    .replace(/(^|[\s(/-])([a-z])/g, (_match, lead: string, letter: string) => `${lead}${letter.toLocaleUpperCase('en-KE')}`);

/** The name and the account reference in a row's details, with numbers, tills and the API chatter dropped. */
function partyOf(details: string): { name: string | null; reference: string | null } {
  // 'Customer Payment to Small Business to - 0743***708 NAME': the payee follows the second 'to'.
  let rest = details.split(/\s+(?:via|by)\s/i)[0].replace(/^Customer Payment to Small Business\s+/i, '');
  const acc = rest.match(/\sAcc\.\s*(.+)$/i);
  const reference = acc ? acc[1].trim() : null;
  if (acc) rest = rest.slice(0, acc.index);
  // What follows 'to' or 'from': a number (or masked number), a dash, then the name.
  const after = rest.match(/\b(?:to|from)\s+(.*)$/i);
  let name = after ? after[1] : '';
  name = name.replace(/^[-\s]+/, '').replace(/^[\d*+]+\s*/, '').replace(/^[-\s]+/, '').trim();
  return { name: name || null, reference };
}

function describe(kind: Kind, name: string | null, reference: string | null): string {
  const who = name ? titleCase(name) : null;
  switch (kind) {
    case 'cash_withdrawal':
      return who ? `Cash withdrawal — ${who}` : 'Cash withdrawal';
    case 'airtime_purchase':
      return 'Airtime';
    case 'person_receipt':
    case 'bank_receipt':
      return who ? `Received from ${who}` : 'Money received';
    case 'paybill_payment':
      return who ? (reference ? `${who} (${titleCase(reference)})` : who) : 'Paybill payment';
    default:
      return who ?? 'M-Pesa payment';
  }
}

const dateOf = (time: string) => time.slice(0, 10);

/** The till or paybill number in a row's details ('... to 123456 - NAME'), which a message never carries. */
const payeeNumberOf = (details: string): string | null => details.match(/\b(?:to|from)\s+(\d{5,7})\s*-/i)?.[1] ?? null;

const left = (index: number, row: StatementRow, reason: string): PreviewLine => ({
  index,
  status: 'skipped',
  reason,
  receipt: row.receipt,
  direction: null,
  type: null,
  amount: row.paidIn ?? row.withdrawn,
  description: null,
  date: dateOf(row.time),
  fee: null,
  mpesaBalance: row.balance,
  alreadyRecorded: null,
});

/** The rows one payment produced (a payment, its charge, a loan draw) are stamped the same second. */
function groupsOf(rows: readonly StatementRow[]): StatementRow[][] {
  const groups: StatementRow[][] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && (last[0].receipt === row.receipt || last[0].time === row.time)) last.push(row);
    else groups.push([row]);
  }
  return groups;
}

const cents = (value: number) => Math.round(value * 100);
const netOf = (row: StatementRow) => (row.paidIn ?? 0) - (row.withdrawn ?? 0);

/**
 * The balance before the first entry and after the last. The rows of one payment
 * are not always listed in the same order, so a payment's closing balance is
 * whichever of its rows lines up with the balance before it plus what it moved.
 */
function balancesOf(groups: readonly StatementRow[][]): { opening: number | null; closing: number | null } {
  if (groups.length === 0) return { opening: null, closing: null };
  type Step = { value: number; from: number };
  const steps: Step[][] = [];
  groups.forEach((group, g) => {
    const net = group.reduce((sum, row) => sum + netOf(row), 0);
    const candidates = [...new Set(group.map((row) => row.balance).filter((v): v is number => v !== null).map(cents))];
    if (g === 0) {
      steps.push(candidates.map((value) => ({ value, from: -1 })));
      return;
    }
    const before = steps[g - 1];
    steps.push(
      candidates.flatMap((value) => {
        const from = before.findIndex((step) => Math.abs(step.value + cents(net) - value) <= 1);
        return from >= 0 ? [{ value, from }] : [];
      }),
    );
  });
  if (steps.some((step) => step.length === 0)) return { opening: null, closing: null };
  let at = steps[steps.length - 1].length - 1;
  const closing = steps[steps.length - 1][at].value;
  for (let g = steps.length - 1; g > 0; g -= 1) at = steps[g][at].from;
  const firstNet = groups[0].reduce((sum, row) => sum + netOf(row), 0);
  return { opening: (steps[0][at].value - cents(firstNet)) / 100, closing: closing / 100 };
}

/** Oldest first, the order the money moved in. */
export function statementLines(
  rows: readonly StatementRow[],
  /** A Fuliza balance recorded as borrowed at the end of an earlier statement (its FB line), which this one's first repayments clear. */
  owedAtStart: { amount: number; receipt: string } | null = null,
): StatementReading {
  const chronological = rows.length > 1 && rows[0].time > rows[rows.length - 1].time ? [...rows].reverse() : [...rows];
  const lines: PreviewLine[] = [];
  let loanDraws = 0;
  let loanRepayments = 0;
  let loanDrawTotal = 0;
  let loanRepaymentTotal = 0;
  let leftOutNet = 0;
  // Drawn before the last repayment, and since it.
  let drawnBeforeRepayment = 0;
  let drawnSinceRepayment = 0;
  let firstRepaymentDate: string | null = null;
  const groups = groupsOf(chronological);

  for (const group of groups) {
    const charges: StatementRow[] = [];
    const mains: StatementRow[] = [];
    for (const row of group) {
      const details = row.details.trim();
      if (DRAW.test(details)) {
        loanDraws += 1;
        loanDrawTotal += row.paidIn ?? 0;
        drawnSinceRepayment += row.paidIn ?? 0;
      } else if (REPAYMENT.test(details)) {
        loanRepayments += 1;
        loanRepaymentTotal += row.withdrawn ?? 0;
        drawnBeforeRepayment += drawnSinceRepayment;
        drawnSinceRepayment = 0;
        firstRepaymentDate ??= dateOf(row.time);
      }
      else if (CHARGE.test(details)) charges.push(row);
      else mains.push(row);
    }
    const charged = charges.reduce((sum, row) => sum + (row.withdrawn ?? 0), 0);
    const foldable = mains.length === 1 && charges.length > 0;

    for (const row of mains) {
      const details = row.details.trim();
      const index = lines.length;
      if (REVERSAL.test(details) && row.paidIn !== null) {
        // Money that came back from an earlier payment: recorded as money in.
        lines.push({
          index,
          status: 'ready',
          reason: null,
          receipt: row.receipt,
          direction: 'in',
          type: 'reversal',
          amount: row.paidIn,
          description: 'Money back: a reversed payment',
          named: false,
          date: dateOf(row.time),
          fee: null,
          mpesaBalance: row.balance,
          alreadyRecorded: null,
        });
        continue;
      }
      const match = REVERSAL.test(details) ? undefined : KINDS.find(([pattern]) => pattern.test(details));
      const amount = row.paidIn ?? row.withdrawn;
      if (amount === null) {
        leftOutNet += netOf(row);
        lines.push(left(index, row, 'This entry has no amount.'));
        continue;
      }
      if (!match) {
        // Not a kind Jamvi knows - a reversal that took money out, or one it has
        // not met yet. It still moved the balance, so it is listed like any
        // other entry, under the statement's own words, for a category to be
        // chosen - not set aside for somebody to notice and record by hand.
        lines.push({
          index,
          status: 'ready',
          reason: null,
          receipt: row.receipt,
          direction: row.paidIn !== null ? 'in' : 'out',
          type: 'other',
          amount,
          description: details,
          named: false,
          date: dateOf(row.time),
          fee: null,
          mpesaBalance: row.balance,
          alreadyRecorded: null,
        });
        continue;
      }
      const [, kind, direction] = match;
      const { name, reference } = partyOf(details);
      lines.push({
        index,
        status: 'ready',
        reason: null,
        receipt: row.receipt,
        direction,
        type: kind,
        amount,
        description: describe(kind, name, reference),
        named: kind === 'airtime_purchase' ? false : Boolean(name),
        payeeNumber: kind === 'person_payment' || kind === 'person_receipt' || kind === 'airtime_purchase' ? null : payeeNumberOf(details),
        date: dateOf(row.time),
        fee: direction === 'out' && foldable && charged > 0 ? Math.round(charged * 100) / 100 : null,
        mpesaBalance: row.balance,
        alreadyRecorded: null,
      });
    }
    if (!foldable) {
      // A charge with no single payment beside it to fold into is still a
      // charge: listed as one, for the charges category. It shares its M-Pesa
      // code with a payment beside it, so it carries its own - the code, "C"
      // and its place among the charges - or saving the payment would make it
      // look already recorded.
      charges.forEach((row, n) => {
        const amount = row.withdrawn ?? row.paidIn;
        if (amount === null) {
          leftOutNet += netOf(row);
          lines.push(left(lines.length, row, 'This charge has no amount.'));
          return;
        }
        lines.push({
          index: lines.length,
          status: 'ready',
          reason: null,
          receipt: row.receipt ? `${row.receipt}C${n + 1}` : null,
          direction: row.withdrawn !== null ? 'out' : 'in',
          type: 'transaction_charge',
          amount,
          description: 'M-Pesa charge',
          named: false,
          date: dateOf(row.time),
          fee: null,
          mpesaBalance: row.balance,
          alreadyRecorded: null,
        });
      });
    }
  }
  // Fuliza, split three ways, none of which the draws and repayments
  // themselves record:
  //  - a balance owed from an earlier statement, repaid here (see owedAtStart);
  //  - the fees: repaid above what was drawn, counting only the loans the last
  //    repayment cleared. A loan drawn after it is still open, and counting
  //    it hid the fees whenever more was drawn than repaid;
  //  - what was drawn after that last repayment: still owed, so borrowed.
  // When the repayments cleared less than was drawn before the last one, the
  // fees cannot be told apart from what is still owed, so all of it is owed.
  const roundCents = (value: number) => Math.round(value * 100) / 100;
  const first = chronological.length > 0 ? dateOf(chronological[0].time) : null;
  const last = chronological.length > 0 ? dateOf(chronological[chronological.length - 1].time) : null;
  const carried = owedAtStart && owedAtStart.amount > 0 ? roundCents(Math.min(owedAtStart.amount, loanRepaymentTotal)) : 0;
  const cleared = roundCents(loanRepaymentTotal - carried - drawnBeforeRepayment);
  const feeDue = loanRepayments > 0 && cleared >= 0.01 ? cleared : 0;
  const owedAtEnd = feeDue > 0 ? roundCents(drawnSinceRepayment) : roundCents(Math.max(0, loanDrawTotal - (loanRepaymentTotal - carried)));
  if (carried > 0 && owedAtStart && first && last) {
    lines.push({
      index: lines.length,
      status: 'ready',
      reason: null,
      receipt: `FR${owedAtStart.receipt.slice(2)}`,
      direction: 'out',
      type: 'fuliza_repaid',
      amount: carried,
      description: 'Fuliza repaid (owed from the last statement)',
      named: false,
      date: firstRepaymentDate ?? first,
      fee: null,
      mpesaBalance: null,
      alreadyRecorded: null,
    });
  }
  if (feeDue > 0 && first && last) {
    lines.push({
      index: lines.length,
      status: 'ready',
      reason: null,
      receipt: fulizaReceipt(first, last),
      direction: 'out',
      type: 'fuliza_fee',
      amount: feeDue,
      description: `Fuliza charges ${first} to ${last}`,
      named: false,
      date: last,
      fee: null,
      mpesaBalance: null,
      alreadyRecorded: null,
    });
  }
  if (owedAtEnd >= 0.01 && first && last) {
    lines.push({
      index: lines.length,
      status: 'ready',
      reason: null,
      receipt: borrowedReceipt(first, last),
      direction: 'in',
      type: 'fuliza_borrowed',
      amount: owedAtEnd,
      description: 'Borrowed from Fuliza (still owed at the end)',
      named: false,
      date: last,
      fee: null,
      mpesaBalance: null,
      alreadyRecorded: null,
    });
  }
  const loanLeftOut = roundCents(loanDrawTotal - loanRepaymentTotal + feeDue + carried - (owedAtEnd >= 0.01 ? owedAtEnd : 0));
  const { opening, closing } = balancesOf(groups);
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    lines,
    loanDraws,
    loanRepayments,
    loanDrawTotal: round(loanDrawTotal),
    loanRepaymentTotal: round(loanRepaymentTotal),
    leftOutNet: round(leftOutNet),
    fulizaFee: feeDue,
    loanOwedAtEnd: owedAtEnd >= 0.01 ? owedAtEnd : 0,
    loanOwedAtStart: carried,
    loanLeftOut,
    opening,
    closing,
    firstDate: chronological.length > 0 ? dateOf(chronological[0].time) : null,
    lastDate: chronological.length > 0 ? dateOf(chronological[chronological.length - 1].time) : null,
  };
}

/**
 * What Fuliza cost over the statement, when it can be read off it.
 *
 * Draws and repayments are both left out, because borrowing is not income and
 * repaying is not spending. But Fuliza charges a fee on every day a loan is
 * open, taken as part of the repayments, so over a statement the repayments
 * come to more than the draws - and that difference is a real cost nothing
 * else records. It is only the fees if every loan in it opened and closed
 * inside the statement; the screen says so.
 *
 * `receipt` stands in for an M-Pesa code, from the first and last
 * day of the statement, so its charges are recognised if recorded twice. Real
 * codes are ten characters; this is fourteen, so they cannot collide.
 */
export function fulizaCharges(reading: StatementReading): { amount: number; from: string; to: string; receipt: string } | null {
  const amount = reading.fulizaFee ?? Math.round((reading.loanRepaymentTotal - reading.loanDrawTotal) * 100) / 100;
  if (amount < 0.01 || !reading.firstDate || !reading.lastDate) return null;
  return { amount, from: reading.firstDate, to: reading.lastDate, receipt: fulizaReceipt(reading.firstDate, reading.lastDate) };
}

/**
 * The Fuliza balance an earlier statement left owed (its FB line, recorded as
 * borrowed), which this statement's first repayments clear - so they are not
 * mistaken for fees. The latest one that ended before this statement starts,
 * unless its repayment (FR and the same digits) is recorded already.
 */
export function fulizaOwedBefore(
  firstDate: string | null | undefined,
  recorded: ReadonlyArray<{ mpesaReceipt?: string | null; amount?: number | string | null }>,
): { amount: number; receipt: string } | null {
  if (!firstDate) return null;
  const receipts = new Set(recorded.map((row) => row.mpesaReceipt).filter(Boolean));
  let best: { amount: number; receipt: string; to: string } | null = null;
  for (const row of recorded) {
    const match = row.mpesaReceipt?.match(/^FB\d{6}(\d{6})$/);
    if (!match) continue;
    const to = `20${match[1].slice(0, 2)}-${match[1].slice(2, 4)}-${match[1].slice(4, 6)}`;
    const amount = Number(row.amount);
    if (to >= firstDate || !(amount > 0) || receipts.has(`FR${row.mpesaReceipt!.slice(2)}`)) continue;
    if (!best || to > best.to) best = { amount, receipt: row.mpesaReceipt!, to };
  }
  return best ? { amount: best.amount, receipt: best.receipt } : null;
}

/** FB, then the statement's first and last day: the Fuliza still owed at its end. FR and the same digits is its repayment. */
function borrowedReceipt(first: string, last: string): string {
  return `FB${fulizaReceipt(first, last).slice(2)}`;
}

/** FZ, then the first and last day as yymmdd: fourteen characters, where real codes are ten. */
function fulizaReceipt(first: string, last: string): string {
  const compact = (day: string) => day.slice(2).replace(/-/g, '');
  return `FZ${compact(first)}${compact(last)}`;
}

/**
 * What Jamvi says an account held at the end of a day: its starting balance
 * plus everything recorded up to and including that day. Set beside the
 * statement's own opening and closing balances, it says whether a difference
 * comes from before the statement (a starting balance, or earlier entries) or
 * from inside it.
 */
export function balanceAtEndOf(
  day: string,
  openingBalance: number,
  transactions: ReadonlyArray<{ date: string; type: string; amount: number | string }>,
): number {
  let balance = openingBalance;
  for (const row of transactions) {
    if (String(row.date).slice(0, 10) > day) continue;
    const amount = Number(row.amount) || 0;
    balance += row.type === 'deposit' ? amount : -amount;
  }
  return Math.round(balance * 100) / 100;
}

/** The day before, as YYYY-MM-DD. */
export function dayBefore(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** An entry in the account, as the import screen reads it back. */
export type RecordedRow = {
  id: number;
  date: string;
  type: string;
  amount: number | string;
  description?: string | null;
  mpesaReceipt?: string | null;
  chargeForTransactionId?: number | null;
};

/**
 * Entries this account has for the statement's days that the statement does
 * not: typed in by hand, pasted under another code, or an M-Pesa charge kept
 * twice - once with its payment and again as a charge of its own. When the
 * statement's own entries add up, these are what leave the balance off.
 */
export function notOnStatement(
  reading: StatementReading,
  rows: readonly RecordedRow[],
): { rows: Array<RecordedRow & { why: string; effect: number }>; net: number } {
  if (!reading.firstDate || !reading.lastDate) return { rows: [], net: 0 };
  const first = reading.firstDate;
  const last = reading.lastDate;
  const onStatement = new Set(reading.lines.map((line) => line.receipt).filter((code): code is string => Boolean(code)));
  const receiptOf = new Map(rows.map((row) => [row.id, row.mpesaReceipt ?? null]));
  const recordedReceipts = new Set(rows.map((row) => row.mpesaReceipt).filter((code): code is string => Boolean(code)));
  const found: Array<RecordedRow & { why: string; effect: number }> = [];
  for (const row of rows) {
    const day = String(row.date).slice(0, 10);
    if (day < first || day > last) continue;
    const amount = Number(row.amount) || 0;
    const effect = row.type === 'deposit' ? amount : -amount;
    if (row.chargeForTransactionId != null) {
      // A charge kept with its payment. Wrong only when the statement lists that
      // charge on its own too, and it was saved that way as well (the payment's
      // code, then C and a number). A charge saved on its own that the statement
      // does not list is caught below instead - counting both would double it.
      const parent = receiptOf.get(row.chargeForTransactionId) ?? null;
      if (parent && [...recordedReceipts].some((code) => code.startsWith(`${parent}C`) && onStatement.has(code))) {
        found.push({ ...row, why: 'Charge recorded twice: with its payment and on its own', effect });
      }
      continue;
    }
    if (row.mpesaReceipt && onStatement.has(row.mpesaReceipt)) continue;
    found.push({ ...row, why: row.mpesaReceipt ? 'Its M-Pesa code is not on this statement' : 'No M-Pesa code: typed in or pasted', effect });
  }
  const net = Math.round(found.reduce((sum, row) => sum + row.effect, 0) * 100) / 100;
  return { rows: found, net };
}

export interface Reconciliation {
  opening: number;
  closing: number;
  /** How far the statement's balance moved, and how far the entries about to be saved move this account. */
  statementChange: number;
  savedChange: number;
  /** What entries this budget already has (saved earlier, from here or from a paste) have moved it by. */
  alreadyRecordedChange: number;
  /** statementChange - savedChange - alreadyRecordedChange: what would still differ after saving. */
  gap: number;
  /** What the difference is made of. These add up to the gap. */
  parts: Array<{ label: string; amount: number }>;
}

/**
 * Whether saving these entries would leave the account moved by as much as the
 * statement says the M-Pesa balance moved, and if not, what makes up the
 * difference. `included` says which lines are ticked to be saved.
 */
export function reconcile(reading: StatementReading, included: (line: PreviewLine) => boolean): Reconciliation | null {
  if (reading.opening === null || reading.closing === null) return null;
  const round = (value: number) => Math.round(value * 100) / 100;
  const effect = (line: PreviewLine) => (line.amount === null || !line.direction ? 0 : line.direction === 'in' ? line.amount : -(line.amount + (line.fee ?? 0)));
  const ready = reading.lines.filter((line) => line.status === 'ready');
  // What the account already has counts as matched: it is in the balance already.
  const alreadyIn = round(ready.filter((line) => line.alreadyRecorded).reduce((sum, line) => sum + effect(line), 0));
  const saved = round(ready.filter((line) => !line.alreadyRecorded && included(line)).reduce((sum, line) => sum + effect(line), 0));
  const notSaved = round(ready.filter((line) => !line.alreadyRecorded && !included(line)).reduce((sum, line) => sum + effect(line), 0));
  const statementChange = round(reading.closing - reading.opening);
  // Fuliza draws and repayments are left out, but their difference is either
  // the fees - listed as their own line, so already in saved or not ticked -
  // or, when more was drawn than repaid, a loan still open at the end: money
  // borrowed, which moved the balance without being income.
  // A reading made before the split was worked out has no loanLeftOut.
  const stillOwed = reading.loanLeftOut ?? Math.max(0, round(reading.loanDrawTotal - reading.loanRepaymentTotal));
  const parts = [
    { label: 'Fuliza not accounted for', amount: stillOwed },
    { label: 'Entries left out with a reason', amount: reading.leftOutNet },
    { label: 'Entries not ticked', amount: notSaved },
  ].filter((part) => Math.abs(part.amount) >= 0.005);
  return {
    opening: reading.opening,
    closing: reading.closing,
    statementChange,
    savedChange: saved,
    alreadyRecordedChange: alreadyIn,
    gap: round(statementChange - saved - alreadyIn),
    parts,
  };
}

/**
 * Whether a Fuliza charge already recorded in this account covers any of the
 * same days. Its receipt names its first and last day (see fulizaCharges), so
 * two statements that overlap - 1 to 28 September, then 15 September to 15
 * October - are caught before the fees for the shared days are counted twice.
 */
export function fulizaChargeOverlap(
  charge: { from: string; to: string; receipt: string },
  recordedReceipts: readonly (string | null | undefined)[],
): { sameStatement: boolean; overlapsFrom: string | null; overlapsTo: string | null } {
  const day = (compact: string) => `20${compact.slice(0, 2)}-${compact.slice(2, 4)}-${compact.slice(4, 6)}`;
  let overlapsFrom: string | null = null;
  let overlapsTo: string | null = null;
  for (const receipt of recordedReceipts) {
    const match = receipt?.match(/^FZ(\d{6})(\d{6})$/);
    if (!match) continue;
    if (receipt === charge.receipt) return { sameStatement: true, overlapsFrom: null, overlapsTo: null };
    const from = day(match[1]);
    const to = day(match[2]);
    if (from <= charge.to && to >= charge.from) {
      overlapsFrom = from;
      overlapsTo = to;
    }
  }
  return { sameStatement: false, overlapsFrom, overlapsTo };
}
