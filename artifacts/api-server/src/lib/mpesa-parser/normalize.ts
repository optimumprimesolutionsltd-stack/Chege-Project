// M-Pesa often prints a number with its middle hidden (0722***443), and some
// copies turn the stars into other symbols. It is a phone number all the same,
// and left as it is, the name in front of it cannot be read.
const PHONE_PATTERNS = [
  /\+?254[\s-]?(?:7\d{2}|1\d{2})[\s-]?\d{3}[\s-]?\d{3}/g,
  /\b0(?:7\d{2}|1\d{2})[\s-]?\d{3}[\s-]?\d{3}\b/g,
  /\+?254(?:7\d{2}|1\d{2})[*+xX•.]{2,5}\d{3}\b/g,
  /\b0(?:7\d{2}|1\d{2})[*+xX•.]{2,5}\d{3}\b/g,
];

export function normalizeMpesaMessage(message: string): string {
  let normalized = message.replace(/\r\n?/g, "\n").trim();
  for (const pattern of PHONE_PATTERNS) {
    normalized = normalized.replace(pattern, "<PHONE>");
  }
  return normalized.replace(/[ \t]+/g, " ").replace(/\n[ \t]+/g, "\n");
}

export function hasMpesaSignals(normalizedMessage: string): boolean {
  return /\b(?:m[- ]?pesa|safaricom|confirmed|ksh|kes|mpesa)\b/i.test(normalizedMessage);
}