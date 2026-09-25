import { parseMpesaMessage } from "./parser";
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
  type: MpesaTransactionType | "fuliza_notice" | null;
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
const IN_TYPES = new Set<MpesaTransactionType>(["person_receipt", "bank_receipt"]);

// Recorded only when the person decides. Guessing what these mean for their
// books would be inventing an answer about their money.
const NEEDS_A_DECISION: Partial<Record<MpesaTransactionType, string>> = {
  cash_deposit: "Cash you gave an agent to put on M-Pesa. Record it yourself as money in from your cash.",
  bank_transfer: "A move between M-Pesa and a bank. Record it yourself as a move between accounts.",
  reversal: "Money that came back from an earlier payment. Record it yourself against that payment.",
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
const ACCESS_FEE = /access\s+fee\s+charged\s+Ksh\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;

/** Turns one message into what the review list shows. Reads only what the parser found. */
export function toImportItem(message: string, index: number): ImportItem {
  const notice = message.match(FULIZA_NOTICE);
  if (notice) {
    const loan = Number(notice[2].replace(/,/g, ""));
    const fee = message.match(ACCESS_FEE)?.[1];
    return skipped(
      index,
      `A Fuliza loan notice (KES ${loan.toLocaleString("en-KE")}${fee ? `, access fee KES ${fee}` : ""}). ` +
        "The payment it covered is a separate message, so this is not recorded on its own.",
      { type: "fuliza_notice", receipt: notice[1].toUpperCase(), amount: Number.isFinite(loan) ? loan : null },
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
    description: describe(tx.transactionType, tx.merchantOrCounterparty, tx.accountReference),
    named: Boolean(tx.merchantOrCounterparty),
    date: tx.date,
    // Only an outgoing payment carries a cost worth recording.
    fee: direction === "out" && tx.fee && tx.fee > 0 ? tx.fee : null,
    mpesaBalance: tx.mpesaBalance,
  };
}

/** Everything one paste holds, in the order it was pasted. */
export function readPaste(text: string): ImportItem[] {
  return splitMpesaMessages(text).map((message, index) => toImportItem(message, index));
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
