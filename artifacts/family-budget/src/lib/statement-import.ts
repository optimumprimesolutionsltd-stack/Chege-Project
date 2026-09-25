import type { PreviewLine } from "./mpesa-import";
import type { StatementRow } from "./statement-table";

/**
 * Turns the rows of an M-Pesa statement into the same review lines a pasted
 * message becomes, so the two share one screen, one set of choices and one way
 * of saving.
 *
 * What the statement holds that a paste does not:
 *  - a Fuliza loan draw ("OverDraft of Credit Party") and the repayment of it
 *    ("OD Loan Repayment"). Neither is spending or income: what the loan bought
 *    is the payment beside it, which is recorded as an ordinary payment. Both
 *    are counted and left out.
 *  - a charge printed as a row of its own next to its payment, folded into that
 *    payment's fee, as a pasted message's "transaction cost" is.
 *
 * Nothing is guessed: wording that is not recognised is left out with a reason,
 * to be recorded by hand.
 */
export interface StatementReading {
  lines: PreviewLine[];
  loanDraws: number;
  loanRepayments: number;
}

const DRAW = /^OverDraft of Credit Party/i;
const REPAYMENT = /^OD Loan Repayment/i;
const CHARGE = /\bCharge$/i;
const REVERSAL = /\bReversal\b/i;

type Kind = "person_payment" | "merchant_payment" | "paybill_payment" | "airtime_purchase" | "cash_withdrawal" | "person_receipt" | "bank_receipt";

const KINDS: Array<[RegExp, Kind, "out" | "in"]> = [
  [/^Customer Bundle Purchase/i, "airtime_purchase", "out"],
  [/^Customer (?:Transfer|Send Money)/i, "person_payment", "out"],
  [/^Merchant Payment/i, "merchant_payment", "out"],
  [/^Pay Bill/i, "paybill_payment", "out"],
  [/^Customer Withdrawal/i, "cash_withdrawal", "out"],
  [/^Transfer from Bank/i, "bank_receipt", "in"],
  [/^(?:Business Payment from|Funds received from|Promotion Payment from|Salary Payment from|Transfer from Archived Funds)/i, "person_receipt", "in"],
];

const titleCase = (value: string) =>
  value
    .toLocaleLowerCase("en-KE")
    .replace(/(^|[\s(/-])([a-z])/g, (_match, lead: string, letter: string) => `${lead}${letter.toLocaleUpperCase("en-KE")}`);

/** The name and the account reference in a row's details, with numbers, tills and the API chatter dropped. */
function partyOf(details: string): { name: string | null; reference: string | null } {
  let rest = details.split(/\s+(?:via|by)\s/i)[0];
  const acc = rest.match(/\sAcc\.\s*(.+)$/i);
  const reference = acc ? acc[1].trim() : null;
  if (acc) rest = rest.slice(0, acc.index);
  // What follows "to" or "from": a number (or masked number), a dash, then the name.
  const after = rest.match(/\b(?:to|from)\s+(.*)$/i);
  let name = after ? after[1] : "";
  name = name.replace(/^[-\s]+/, "").replace(/^[\d*+]+\s*/, "").replace(/^[-\s]+/, "").trim();
  return { name: name || null, reference };
}

function describe(kind: Kind, name: string | null, reference: string | null): string {
  const who = name ? titleCase(name) : null;
  switch (kind) {
    case "cash_withdrawal":
      return who ? `Cash withdrawal — ${who}` : "Cash withdrawal";
    case "airtime_purchase":
      return "Airtime";
    case "person_receipt":
    case "bank_receipt":
      return who ? `Received from ${who}` : "Money received";
    case "paybill_payment":
      return who ? (reference ? `${who} (${titleCase(reference)})` : who) : "Paybill payment";
    default:
      return who ?? "M-Pesa payment";
  }
}

const dateOf = (time: string) => time.slice(0, 10);

const left = (index: number, row: StatementRow, reason: string): PreviewLine => ({
  index,
  status: "skipped",
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

/** Oldest first, the order the money moved in. */
export function statementLines(rows: readonly StatementRow[]): StatementReading {
  const chronological = rows.length > 1 && rows[0].time > rows[rows.length - 1].time ? [...rows].reverse() : [...rows];
  const lines: PreviewLine[] = [];
  let loanDraws = 0;
  let loanRepayments = 0;

  for (const group of groupsOf(chronological)) {
    const charges: StatementRow[] = [];
    const mains: StatementRow[] = [];
    for (const row of group) {
      const details = row.details.trim();
      if (DRAW.test(details)) loanDraws += 1;
      else if (REPAYMENT.test(details)) loanRepayments += 1;
      else if (CHARGE.test(details)) charges.push(row);
      else mains.push(row);
    }
    const charged = charges.reduce((sum, row) => sum + (row.withdrawn ?? 0), 0);
    const foldable = mains.length === 1 && charges.length > 0;

    for (const row of mains) {
      const details = row.details.trim();
      const index = lines.length;
      if (REVERSAL.test(details)) {
        lines.push(left(index, row, "Money that came back from an earlier payment. Record it yourself against that payment."));
        continue;
      }
      const match = KINDS.find(([pattern]) => pattern.test(details));
      const amount = row.paidIn ?? row.withdrawn;
      if (!match || amount === null) {
        lines.push(left(index, row, "This kind of entry is not recognised yet."));
        continue;
      }
      const [, kind, direction] = match;
      const { name, reference } = partyOf(details);
      lines.push({
        index,
        status: "ready",
        reason: null,
        receipt: row.receipt,
        direction,
        type: kind,
        amount,
        description: describe(kind, name, reference),
        named: kind === "airtime_purchase" ? false : Boolean(name),
        date: dateOf(row.time),
        fee: direction === "out" && foldable && charged > 0 ? Math.round(charged * 100) / 100 : null,
        mpesaBalance: row.balance,
        alreadyRecorded: null,
      });
    }
    if (!foldable) {
      for (const row of charges) lines.push(left(lines.length, row, "A charge with no single payment beside it. Record it yourself as a bank charge."));
    }
  }
  return { lines, loanDraws, loanRepayments };
}
