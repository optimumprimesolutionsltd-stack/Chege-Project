export const MPESA_PARSER_VERSION = "foundation-0.1.0";

export type MpesaTransactionType =
  | "person_payment"
  | "person_receipt"
  | "merchant_payment"
  | "paybill_payment"
  | "airtime_purchase"
  | "cash_withdrawal"
  | "cash_deposit"
  | "bank_transfer"
  | "reversal"
  | "failed"
  | "other";

export type MpesaPurchaseCategory =
  | "postpaid_bundle"
  | "minutes"
  | "airtime"
  | "gift"
  | "wifi"
  | null;

export type ParserConfidence = "high" | "medium" | "low" | "none";

export interface MpesaTransaction {
  transactionId: string | null;
  transactionType: MpesaTransactionType | null;
  purchaseCategory: MpesaPurchaseCategory;
  amount: number | null;
  currency: string | null;
  merchantOrCounterparty: string | null;
  accountReference: string | null;
  phoneNumber: string | null;
  date: string | null;
  time: string | null;
  mpesaBalance: number | null;
  fee: number | null;
  parserVersion: string;
  confidence: ParserConfidence;
  parseWarnings: string[];
}

export interface ParseResult {
  status: "parsed" | "unsupported" | "invalid";
  transaction: MpesaTransaction | null;
  confidence: ParserConfidence;
  warnings: string[];
  normalizedMessage: string;
}