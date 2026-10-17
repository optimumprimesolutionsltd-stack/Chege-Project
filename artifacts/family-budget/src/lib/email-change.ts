/**
 * Moving your account to a different email (api-server lib/email-change.ts).
 * A code goes to the new address, and the change happens once it comes back.
 * An account with no password - one made with Google - sets one in the same
 * step, so it can always sign in with the new address.
 *
 * The same rules and wording as the phone's lib/emailChange.ts.
 */

export const MIN_PASSWORD_LENGTH = 8;

export const EMAIL_CHANGE_INTRO =
  "Everything moves with it: your Personal budget, every group, and your subscription. We'll send a code to the new address to check it's yours.";

export const EMAIL_CHANGE_PASSWORD_NOTE =
  "You sign in with Google and have no Jamvi password yet. Choose one, so you can sign in with your new email whether or not it is a Google account.";

export function emailChangeCodeSent(email: string): string {
  return `We've emailed a 6-digit code to ${email}. It expires in 10 minutes.`;
}

export function emailChangedMessage(email: string): string {
  return `From now on, sign in with ${email}. Your old address no longer opens this account.`;
}

export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function confirmReady(code: string, password: string, needsPassword: boolean): boolean {
  return /^\d{6}$/.test(code.trim()) && (!needsPassword || password.length >= MIN_PASSWORD_LENGTH);
}
