/**
 * M-Pesa messages shared to Jamvi from another app (Android's Share button),
 * waiting for the paste screen to pick them up.
 *
 * A share can arrive when the screen is not open (it is opened for it) or while
 * it already is (it reads them straight away), so this holds the text and tells
 * whoever is listening. Several shares in a row add up rather than replace one
 * another.
 */
let pending = '';
const listeners = new Set<() => void>();

export function queueSharedMessages(text: string): void {
  const incoming = text.trim();
  if (!incoming) return;
  pending = pending ? `${pending}\n\n${incoming}` : incoming;
  listeners.forEach((listener) => listener());
}

/** Hands over everything waiting, once. */
export function takeSharedMessages(): string {
  const waiting = pending;
  pending = '';
  return waiting;
}

/** Runs when messages are queued. Returns the way to stop listening. */
export function onSharedMessages(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Whether shared text is worth opening the paste screen for. Anything can be
 * shared to Jamvi, and a web link or a note should not open it: an M-Pesa
 * confirmation names M-PESA or says Confirmed, and carries an amount.
 */
export function looksLikeMpesa(text: string): boolean {
  return /\b(?:m[- ]?pesa|confirmed)\b/i.test(text) && /\b(?:ksh|kes)\s*[0-9]/i.test(text);
}
