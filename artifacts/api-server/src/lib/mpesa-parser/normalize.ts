const PHONE_PATTERNS = [
  /\+?254[\s-]?(?:7\d{2}|1\d{2})[\s-]?\d{3}[\s-]?\d{3}/g,
  /\b0(?:7\d{2}|1\d{2})[\s-]?\d{3}[\s-]?\d{3}\b/g,
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