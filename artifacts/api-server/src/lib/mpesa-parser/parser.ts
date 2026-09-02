import {
  MPESA_PARSER_VERSION,
  type MpesaTransaction,
  type MpesaPurchaseCategory,
  type MpesaTransactionType,
  type ParseResult,
  type ParserConfidence,
} from "./types";
import { hasMpesaSignals, normalizeMpesaMessage } from "./normalize";

const amountPattern = /\b(?:ksh|kes)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
const transactionIdPattern = /\b([A-Z0-9]{8,15})\s+confirmed\b/i;
const reversalPattern = /\breversal\s+of\s+transaction\s+([A-Z0-9]{8,15})\b.*?\bhas\s+been\s+successfully\s+reversed\b/i;
const datePatterns = [
  /\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/,
  /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i,
];
const timePattern = /\b([01]?\d|2[0-3]):([0-5]\d)(?:\s*([AP]M))?\b/i;
const attachedMeridiemTimePattern = /\b([01]?\d|2[0-3]):([0-5]\d)\s*([AP]M)(?=\s|withdraw\b)/i;

const monthNumbers: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function parseMoney(value: string | undefined, allowZero = false): number | null {
  if (!value) return null;
  const amount = Number(value.replace(/,/g, ""));
  return Number.isFinite(amount) && (allowZero ? amount >= 0 : amount > 0) ? amount : null;
}

function parseDate(message: string): string | null {
  const numeric = message.match(datePatterns[0]);
  if (numeric) {
    const day = numeric[1].padStart(2, "0");
    const month = numeric[2].padStart(2, "0");
    const year = numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3];
    return `${year}-${month}-${day}`;
  }
  const named = message.match(datePatterns[1]);
  if (named) {
    const month = monthNumbers[named[2].slice(0, 3).toLowerCase()];
    return month ? `${named[3]}-${month}-${named[1].padStart(2, "0")}` : null;
  }
  return null;
}

function parseTime(message: string): string | null {
  const match = message.match(attachedMeridiemTimePattern) ?? message.match(timePattern);
  if (!match) return null;
  let hour = Number(match[1]);
  if (match[3]) {
    const meridiem = match[3].toUpperCase();
    if (meridiem === "PM" && hour < 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
  }
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function detectPurchaseCategory(message: string): MpesaPurchaseCategory {
  const lower = message.toLowerCase();
  if (/\bpostpaid\s+bundles?\b/.test(lower)) return "postpaid_bundle";
  if (/\bsafaricom\s+offers\b.*\baccount\s+tunukiwa\b/.test(lower)) return "minutes";
  if (/\bsafaricom\s+data\s+bundles\b.*\baccount\s+talkmore\b/.test(lower)) return "minutes";
  if (/\bsafaricom\s*home\b/.test(lower)) return "wifi";
  if (/\bbought\s+(?:ksh|kes)\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?\s+of\s+airtime\b/.test(lower)) {
    return "airtime";
  }
  if (/\bdirect\s+pay\s+04\b/.test(lower)) return "airtime";
  return null;
}

function detectTransactionType(
  message: string,
  purchaseCategory: MpesaPurchaseCategory,
): MpesaTransactionType | null {
  const lower = message.toLowerCase();
  if (reversalPattern.test(message)) return "reversal";
  if (/\bfailed\b|\bcould not\b|\bunsuccessful\b/.test(lower)) return "failed";
  if (purchaseCategory) return "airtime_purchase";
  if (/\bairtime\b/.test(lower)) return "airtime_purchase";
  if (/(?:\b|[ap]m)withdraw(?:al)?\b|\batm\b/.test(lower)) return "cash_withdrawal";
  if (/\bdeposit(?:ed)?\b|\bgive\s+(?:ksh|kes)\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?\s+cash\s+to\b/.test(lower)) {
    return "cash_deposit";
  }
  if (/\b(?:bank to|m[- ]?pesa to bank|bank transfer)\b/.test(lower)) return "bank_transfer";
  if (/\bpaybill\b|\baccount number\b|\bfor\s+account\b/.test(lower)) return "paybill_payment";
  if (/\bsent\s+to\b/.test(lower)) return "person_payment";
  if (/\bpaid to\b.*\b(?:market|mall|express|supermarket|shop|store|restaurant|hotel|pharmacy|dishes)\b/.test(lower)) {
    return "merchant_payment";
  }
  if (/\bpaid to\s+[A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){2,}\s*(?:\.|\bon\b)/i.test(message)) {
    return "person_payment";
  }
  if (/\b(?:tills?|merchant|paid to)\b/.test(lower)) return "merchant_payment";
  if (/\b(?:received|credited)\b/.test(lower) && /\b(?:bank|bulk\s+account|im\s+bank|equity|kcb)\b/.test(lower)) {
    return "bank_receipt";
  }
  if (/\b(?:received|credited)\b/.test(lower)) return "person_receipt";
  if (/\b(?:sent|send|transferred|to)\b/.test(lower)) return "person_payment";
  return null;
}

function extractCounterparty(message: string): string | null {
  const withdrawalMatch = message.match(
    /(?:\b|[ap]m)withdraw\s+(?:ksh|kes)\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?\s+from\s+(.+?)(?=\s+new\s+m[- ]?pesa\s+balance\b|$)/i,
  );
  if (withdrawalMatch) {
    const withdrawalValue = withdrawalMatch[1].trim().replace(/\s+/g, " ").replace(/[.\s]+$/, "");
    return withdrawalValue || null;
  }

  const depositMatch = message.match(
    /\bgive\s+(?:ksh|kes)\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?\s+cash\s+to\s+(.+?)(?=\s+new\s+m[- ]?pesa\s+balance\b|$)/i,
  );
  if (depositMatch) {
    const depositValue = depositMatch[1].trim().replace(/\s+/g, " ").replace(/[.\s]+$/, "");
    return depositValue || null;
  }

  const match = message.match(
    /\b(?:paid to|sent to|received from|transferred to|from)\s+([A-Za-z][A-Za-z0-9 &'./-]{1,70}?)(?=\s+(?:on|at|for\s+account|new balance|balance|fee)\b|\s+<PHONE>|[.,]|$)/i,
  );
  const value = match?.[1]?.trim().replace(/\s+/g, " ");
  return value ? value : null;
}

function extractAccountReference(message: string): string | null {
  const match = message.match(
    /\bfor\s+account\s+([A-Za-z0-9][A-Za-z0-9 _./-]{0,70}?)(?=\s+on\b|\s+new\s+m[- ]?pesa\b|\s+transaction\s+cost\b|\s+amount\s+you\s+can\s+transact\b|[.,]|$)/i,
  );
  const value = match?.[1]?.trim().replace(/\s+/g, " ");
  return value ? value : null;
}

function confidenceFor(
  transactionId: string | null,
  amount: number | null,
  transactionType: MpesaTransactionType | null,
): ParserConfidence {
  if (transactionId && amount !== null && transactionType) return "high";
  if ((transactionId && amount !== null) || (amount !== null && transactionType)) return "medium";
  if (transactionId || amount !== null || transactionType) return "low";
  return "none";
}

export function parseMpesaMessage(message: string): ParseResult {
  const normalizedMessage = normalizeMpesaMessage(message);
  if (!normalizedMessage) {
    return {
      status: "invalid",
      transaction: null,
      confidence: "none",
      warnings: ["Paste an anonymized M-Pesa message before parsing."],
      normalizedMessage: "",
    };
  }

  if (!hasMpesaSignals(normalizedMessage)) {
    return {
      status: "unsupported",
      transaction: null,
      confidence: "none",
      warnings: ["This text does not contain recognizable M-Pesa signals yet."],
      normalizedMessage,
    };
  }

  const transactionId = normalizedMessage.match(transactionIdPattern)?.[1]?.toUpperCase() ?? null;
  const originalTransactionId = normalizedMessage.match(reversalPattern)?.[1]?.toUpperCase() ?? null;
  const amountMatch = normalizedMessage.match(amountPattern);
  const amount = parseMoney(amountMatch?.[1]);
  const purchaseCategory = detectPurchaseCategory(normalizedMessage);
  const transactionType = detectTransactionType(normalizedMessage, purchaseCategory);
  const confidence = confidenceFor(transactionId, amount, transactionType);
  const warnings: string[] = [];

  if (!transactionId) warnings.push("Transaction ID was not found.");
  if (transactionType === "reversal" && !originalTransactionId) {
    warnings.push("Original transaction ID was not found for this reversal.");
  }
  if (amount === null) warnings.push("A positive KSh amount was not found.");
  if (!transactionType) warnings.push("Transaction type is not recognized by the foundation parser.");
  if (/\b(?:07\d{8}|254\d{9})\b/.test(message)) {
    warnings.push("A phone number may still be present. Replace it with a placeholder before sharing this example.");
  }

  const transaction: MpesaTransaction = {
    transactionId,
    originalTransactionId,
    transactionType,
    purchaseCategory,
    amount,
    currency: amount !== null ? "KES" : null,
    merchantOrCounterparty: extractCounterparty(normalizedMessage),
    accountReference: extractAccountReference(normalizedMessage),
    phoneNumber: null,
    date: parseDate(normalizedMessage),
    time: parseTime(normalizedMessage),
    mpesaBalance: parseMoney(
      normalizedMessage.match(/\b(?:new\s+)?m[- ]?pesa(?:\s+account)?\s+balance(?:\s+is)?\s*(?:ksh|kes)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i)?.[1],
      true,
    ),
    fee: parseMoney(
      normalizedMessage.match(/\b(?:transaction\s+cost|fee)(?:\s+was|\s+is|,|:)?\s*(?:ksh|kes)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i)?.[1],
      true,
    ),
    parserVersion: MPESA_PARSER_VERSION,
    confidence,
    parseWarnings: warnings,
  };

  return {
    status: "parsed",
    transaction,
    confidence,
    warnings,
    normalizedMessage,
  };
}