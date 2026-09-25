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
}

const DRAW = /^OverDraft of Credit Party/i;
const REPAYMENT = /^OD Loan Repayment/i;
const CHARGE = /\bCharge$/i;
const REVERSAL = /\bReversal\b/i;

type Kind = 'person_payment' | 'merchant_payment' | 'paybill_payment' | 'airtime_purchase' | 'cash_withdrawal' | 'person_receipt' | 'bank_receipt';

const KINDS: Array<[RegExp, Kind, 'out' | 'in']> = [
  [/^Customer Bundle Purchase/i, 'airtime_purchase', 'out'],
  [/^Customer (?:Transfer|Send Money)/i, 'person_payment', 'out'],
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
  let rest = details.split(/\s+(?:via|by)\s/i)[0];
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
export function statementLines(rows: readonly StatementRow[]): StatementReading {
  const chronological = rows.length > 1 && rows[0].time > rows[rows.length - 1].time ? [...rows].reverse() : [...rows];
  const lines: PreviewLine[] = [];
  let loanDraws = 0;
  let loanRepayments = 0;
  let loanDrawTotal = 0;
  let loanRepaymentTotal = 0;
  let leftOutNet = 0;
  const groups = groupsOf(chronological);

  for (const group of groups) {
    const charges: StatementRow[] = [];
    const mains: StatementRow[] = [];
    for (const row of group) {
      const details = row.details.trim();
      if (DRAW.test(details)) {
        loanDraws += 1;
        loanDrawTotal += row.paidIn ?? 0;
      } else if (REPAYMENT.test(details)) {
        loanRepayments += 1;
        loanRepaymentTotal += row.withdrawn ?? 0;
      }
      else if (CHARGE.test(details)) charges.push(row);
      else mains.push(row);
    }
    const charged = charges.reduce((sum, row) => sum + (row.withdrawn ?? 0), 0);
    const foldable = mains.length === 1 && charges.length > 0;

    for (const row of mains) {
      const details = row.details.trim();
      const index = lines.length;
      if (REVERSAL.test(details)) {
        leftOutNet += netOf(row);
        lines.push(left(index, row, 'Money that came back from an earlier payment. Record it yourself against that payment.'));
        continue;
      }
      const match = KINDS.find(([pattern]) => pattern.test(details));
      const amount = row.paidIn ?? row.withdrawn;
      if (!match || amount === null) {
        leftOutNet += netOf(row);
        lines.push(left(index, row, 'This kind of entry is not recognised yet.'));
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
        date: dateOf(row.time),
        fee: direction === 'out' && foldable && charged > 0 ? Math.round(charged * 100) / 100 : null,
        mpesaBalance: row.balance,
        alreadyRecorded: null,
      });
    }
    if (!foldable) {
      for (const row of charges) leftOutNet += netOf(row);
      for (const row of charges) lines.push(left(lines.length, row, 'A charge with no single payment beside it. Record it yourself as a bank charge.'));
    }
  }
  const { opening, closing } = balancesOf(groups);
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    lines,
    loanDraws,
    loanRepayments,
    loanDrawTotal: round(loanDrawTotal),
    loanRepaymentTotal: round(loanRepaymentTotal),
    leftOutNet: round(leftOutNet),
    opening,
    closing,
  };
}

export interface Reconciliation {
  opening: number;
  closing: number;
  /** How far the statement's balance moved, and how far the entries about to be saved move this account. */
  statementChange: number;
  savedChange: number;
  /** statementChange - savedChange: what would still differ after saving. */
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
  const saved = round(ready.filter(included).reduce((sum, line) => sum + effect(line), 0));
  const notSaved = round(ready.filter((line) => !included(line)).reduce((sum, line) => sum + effect(line), 0));
  const statementChange = round(reading.closing - reading.opening);
  const parts = [
    { label: 'Fuliza loan repayments (not spending, so not recorded)', amount: -reading.loanRepaymentTotal },
    { label: 'Fuliza loans (not income, so not recorded)', amount: reading.loanDrawTotal },
    { label: 'Entries left out with a reason', amount: reading.leftOutNet },
    { label: 'Entries not ticked, or already recorded', amount: notSaved },
  ].filter((part) => Math.abs(part.amount) >= 0.005);
  return { opening: reading.opening, closing: reading.closing, statementChange, savedChange: saved, gap: round(statementChange - saved), parts };
}
