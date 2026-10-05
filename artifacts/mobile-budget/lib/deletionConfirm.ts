/**
 * Confirming a deletion: the 6-digit code emailed to the account, or - for an
 * account with no email, which can never get one - typing the word the server
 * names ("DELETE"). Asked for on 5 Oct 2026, with a fingerprint check to come
 * in the next app build.
 */

/** The word to type instead of a code, when the request-code answer names one. */
export function typedWord(answer: unknown): string | null {
  const word = (answer as { confirmWith?: unknown } | null)?.confirmWith;
  return typeof word === 'string' && word.trim() ? word.trim().toUpperCase() : null;
}

export function cleanConfirmInput(text: string, word: string | null): string {
  return word ? text.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 12) : text.replace(/[^\d]/g, '').slice(0, 6);
}

export function confirmReady(value: string, word: string | null): boolean {
  return word ? value.trim().toUpperCase() === word : /^\d{6}$/.test(value);
}

export function confirmBody(value: string, word: string | null): { code: string } | { confirm: string } {
  return word ? { confirm: value.trim() } : { code: value };
}
