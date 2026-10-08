import { parseMpesaMessage } from "./parser";
import { personTagOf, phoneIn, withPersonTag } from "./person-number";
import { MPESA_PARSER_VERSION, type MpesaTransactionType } from "./types";

/** Most messages one paste may carry, so a mistake cannot become a huge request. */
export const MAX_MESSAGES_PER_PASTE = 200;

/**
 * Splits what somebody copied out of their Messages app into one string per
 * M-Pesa message.
 *
 * Every confirmation opens with its receipt code followed by "Confirmed" (a
 * code has capitals and at least one digit, so an ordinary word before
 * "confirmed" never starts a message). Anything before the first code that
 * still looks like a single message is kept whole, so pasting just one works.
 */
export function splitMpesaMessages(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];
  const parts = normalized
    .split(/(?=\b(?=[A-Z0-9]*\d)[A-Z0-9]{8,15}\s+[Cc]onfirmed\b)/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.slice(0, MAX_MESSAGES_PER_PASTE);
}

export type ImportDirection = "out" | "in";

export interface ImportItem {
  /** Position in the paste, so the review list keeps its order. */
  index: number;
  /**
   * `ready` can be recorded as it is; `skipped` cannot be recorded without a
   * decision only the person can make, and says why.
   */
  status: "ready" | "skipped";
  reason: string | null;
  receipt: string | null;
  direction: ImportDirection | null;
  type: MpesaTransactionType | "fuliza_notice" | "fuliza_fee" | "fuliza_repayment" | null;
  amount: number | null;
  /** What the money went to, or came from, in words worth keeping as the note. */
  description: string | null;
  /** False when the message named nobody, so the description is only a generic label. */
  named: boolean;
  /** YYYY-MM-DD as printed on the message; null when the message carried none. */
  date: string | null;
  /** The M-Pesa "transaction cost" — a bank charge of its own. */
  fee: number | null;
  mpesaBalance: number | null;
}

const OUT_TYPES = new Set<MpesaTransactionType>([
  "person_payment",
  "merchant_payment",
  "paybill_payment",
  "airtime_purchase",
  "cash_withdrawal",
]);
const IN_TYPES = new Set<MpesaTransactionType>(["person_receipt", "bank_receipt", "reversal"]);

// A reversal goes either way. Undoing a payment you made says the money "is
// credited to your M-PESA account" - money back. Undoing money somebody sent
// you says it "is debited from your M-PESA account": it leaves, and must not be
// counted as a second lot of money in (5 Oct 2026, an 8,000 receipt reversed
// showed as +8,000 twice).
/**
 * How a reversal of money received is filed: a payment out, followed by the
 * receipt code it undid. The two cancel once saved - the take-back carries no
 * category, so it is not spending, and the receipt it names is left out of
 * income (lib/reversal-links.ts) - so the money is counted neither way.
 */
export const TAKEN_BACK_PREFIX = "Taken back: reversal of ";

const REVERSAL_TAKEN_BACK = /\bis\s+debited\s+from\s+your\b/i;

// Recorded only when the person decides. Guessing what these mean for their
// books would be inventing an answer about their money.
const NEEDS_A_DECISION: Partial<Record<MpesaTransactionType, string>> = {
  cash_deposit: "Cash you gave an agent to put on M-Pesa. Record it yourself as money in from your cash.",
  bank_transfer: "A move between M-Pesa and a bank. Record it yourself as a move between accounts.",
  failed: "This one did not go through, so there is nothing to record.",
  other: "This kind of message is not recognised yet.",
};

const titleCase = (value: string) =>
  value
    .toLocaleLowerCase("en-KE")
    .replace(/(^|[\s(/-])([a-z])/g, (_match, lead: string, letter: string) => `${lead}${letter.toLocaleUpperCase("en-KE")}`);

function describe(type: MpesaTransactionType, counterparty: string | null, reference: string | null): string {
  const who = counterparty ? titleCase(counterparty) : null;
  switch (type) {
    case "cash_withdrawal":
      return who ? `Cash withdrawal — ${who}` : "Cash withdrawal";
    case "airtime_purchase":
      return who ? `Airtime — ${who}` : "Airtime";
    case "person_receipt":
    case "bank_receipt":
      return who ? `Received from ${who}` : "Money received";
    case "reversal":
      return reference ? `Money back: reversal of ${reference}` : "Money back: a reversed payment";
    case "paybill_payment":
      return who ? (reference ? `${who} (${titleCase(reference)})` : who) : "Paybill payment";
    default:
      return who ?? "M-Pesa payment";
  }
}

const skipped = (index: number, reason: string, partial: Partial<ImportItem> = {}): ImportItem => ({
  index,
  status: "skipped",
  reason,
  receipt: null,
  direction: null,
  type: null,
  amount: null,
  description: null,
  named: false,
  date: null,
  fee: null,
  mpesaBalance: null,
  ...partial,
});

// A Fuliza notice follows the payment it covered and carries that payment's
// receipt code. Its first amount is the loan, not a second payment, so reading
// it as one would count the same spending twice.
const FULIZA_NOTICE = /^\s*([A-Z0-9]{8,15})\s+[Cc]onfirmed\.?\s*Fuliza\s+M-?PESA\s+amount\s+is\s+Ksh\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
export const FULIZA_FEE_SUFFIX = "FEE";
// "Ksh 3,230.07 from your M-PESA has been used to fully pay your outstanding
// Fuliza M-PESA." Paying the loan back is not spending: what it bought is
// already recorded as its own payment, and counting this too would double it.
const FULIZA_REPAYMENT = /has\s+been\s+used\s+to\s+(?:fully|partially|partly)\s+(?:re)?pay\s+(?:your\s+)?outstanding\s+Fuliza/i;
const FIRST_AMOUNT = /Ksh\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
const CODE_AT_START = /^\s*([A-Z0-9]{8,15})\s+[Cc]onfirmed/;
const ACCESS_FEE = /access\s+fee\s+charged\s+Ksh\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;

/** Turns one message into what the review list shows. Reads only what the parser found. */
export function toImportItem(message: string, index: number): ImportItem {
  if (FULIZA_REPAYMENT.test(message)) {
    const amountText = message.match(FIRST_AMOUNT)?.[1];
    const amount = amountText ? Number(amountText.replace(/,/g, "")) : NaN;
    return skipped(
      index,
      `Fuliza being paid back${Number.isFinite(amount) ? ` (KES ${amount.toLocaleString("en-KE")})` : ""}. ` +
        "It is not spending: what the loan paid for is already its own message.",
      { type: "fuliza_repayment", receipt: message.match(CODE_AT_START)?.[1]?.toUpperCase() ?? null, amount: Number.isFinite(amount) ? amount : null },
    );
  }
  const notice = message.match(FULIZA_NOTICE);
  if (notice) {
    const code = notice[1].toUpperCase();
    const loan = Number(notice[2].replace(/,/g, ""));
    const feeText = message.match(ACCESS_FEE)?.[1];
    const fee = feeText ? Number(feeText.replace(/,/g, "")) : NaN;
    // The access fee is a real cost, and the one part of a Fuliza notice that is
    // spending: recorded as a bank charge. The loan itself is not, because the
    // payment it covered is its own message.
    if (Number.isFinite(fee) && fee > 0) {
      return {
        index,
        status: "ready",
        reason: null,
        // The notice shares its payment's receipt code, and a code can be
        // recorded once per budget, so the fee carries its own: the same notice
        // pasted twice is still refused, and the payment keeps its code.
        receipt: `${code}${FULIZA_FEE_SUFFIX}`,
        direction: "out",
        type: "fuliza_fee",
        amount: fee,
        description: "Fuliza access fee",
        named: true,
        date: null,
        fee: null,
        mpesaBalance: null,
      };
    }
    return skipped(
      index,
      `A Fuliza loan notice (KES ${loan.toLocaleString("en-KE")}). ` +
        "The payment it covered is a separate message, so this is not recorded on its own.",
      { type: "fuliza_notice", receipt: code, amount: Number.isFinite(loan) ? loan : null },
    );
  }
  const result = parseMpesaMessage(message);
  const tx = result.transaction;
  if (result.status !== "parsed" || !tx) {
    return skipped(index, "This does not look like an M-Pesa message.");
  }
  const receipt = tx.transactionId;
  if (!receipt || tx.amount === null || !tx.transactionType) {
    return skipped(index, "Could not read this message. Check it was copied whole.", {
      receipt,
      type: tx.transactionType,
      amount: tx.amount,
    });
  }

  const decision = NEEDS_A_DECISION[tx.transactionType];
  const base = {
    receipt,
    type: tx.transactionType,
    amount: tx.amount,
    date: tx.date,
    mpesaBalance: tx.mpesaBalance,
  };
  if (decision) return skipped(index, decision, base);

  if (tx.transactionType === "reversal" && REVERSAL_TAKEN_BACK.test(message)) {
    // Money out, never money back. Its description names the receipt it
    // undid, which is what makes the two cancel (TAKEN_BACK_PREFIX).
    return {
      index,
      status: "ready",
      reason: null,
      receipt,
      direction: "out",
      type: "reversal",
      amount: tx.amount,
      description: tx.originalTransactionId ? `${TAKEN_BACK_PREFIX}${tx.originalTransactionId}` : "Taken back: a reversed receipt",
      named: false,
      date: tx.date,
      fee: null,
      mpesaBalance: tx.mpesaBalance,
    };
  }

  const direction: ImportDirection | null = OUT_TYPES.has(tx.transactionType)
    ? "out"
    : IN_TYPES.has(tx.transactionType)
      ? "in"
      : null;
  if (!direction) return skipped(index, NEEDS_A_DECISION.other ?? "Not recognised.", base);

  return {
    index,
    status: "ready",
    reason: null,
    receipt,
    direction,
    type: tx.transactionType,
    amount: tx.amount,
    // A person: their number's tag after the name, so two of the same name stay two people (person-number).
    description: tx.transactionType === "person_payment" || tx.transactionType === "person_receipt"
      ? withPersonTag(describe(tx.transactionType, tx.merchantOrCounterparty, tx.accountReference), personTagOf(phoneIn(message)))
      : describe(tx.transactionType, tx.merchantOrCounterparty, tx.transactionType === "reversal" ? tx.originalTransactionId : tx.accountReference),
    named: Boolean(tx.merchantOrCounterparty),
    date: tx.date,
    // Only an outgoing payment carries a cost worth recording.
    fee: direction === "out" && tx.fee && tx.fee > 0 ? tx.fee : null,
    mpesaBalance: tx.mpesaBalance,
  };
}

/** Everything one paste holds, in the order it was pasted. */
export function readPaste(text: string): ImportItem[] {
  const items = splitMpesaMessages(text).map((message, index) => toImportItem(message, index));
  // A Fuliza notice carries no date of its own (the date in it is when the loan
  // is due), but the payment it covered does, and shares its code.
  return items.map((item) => {
    if (item.type !== "fuliza_fee" || item.date || !item.receipt) return item;
    const code = item.receipt.slice(0, -FULIZA_FEE_SUFFIX.length);
    const payment = items.find((other) => other.receipt === code && other.type !== "fuliza_fee" && other.date);
    return payment ? { ...item, date: payment.date } : item;
  });
}

/**
 * The text relayed when somebody sends a message so the parser can learn its
 * format. Numbers are masked again here whatever the phone did, and the report
 * carries what the parser made of the message, so whoever reads it can see
 * straight away what was missed. Built from the message alone: nothing that
 * says who sent it goes in.
 */
export function buildFormatReport(message: string): string {
  const result = parseMpesaMessage(message);
  const tx = result.transaction;
  const seen = tx
    ? [
        `type=${tx.transactionType ?? "none"}`,
        `amount=${tx.amount ?? "none"}`,
        `counterparty=${tx.merchantOrCounterparty ?? "none"}`,
        `date=${tx.date ?? "none"}`,
        `fee=${tx.fee ?? "none"}`,
        `confidence=${tx.confidence}`,
      ].join(" ")
    : `status=${result.status}`;
  return [
    "M-Pesa format report",
    `Parser version: ${MPESA_PARSER_VERSION}`,
    `Parser saw: ${seen}`,
    ...(result.warnings.length > 0 ? [`Warnings: ${result.warnings.join(" | ")}`] : []),
    "",
    result.normalizedMessage,
  ].join("\n");
}
