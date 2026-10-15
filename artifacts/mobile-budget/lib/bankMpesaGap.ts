import type { Leftover } from '@/lib/reconcileLeftover';
import { newSmsTitle } from '@/lib/mpesaSms';

/**
 * What Bank says under M-Pesa's own Balance now when Jamvi is behind it.
 *
 * Balance now comes from the newest M-Pesa message, and each entry's balance is
 * moved by the gap, so the list ends on the right figure even when the latest
 * payment is not saved: "the mpesa balance is perfect, but i cant see latest
 * payment yet its balanced?" (15 Oct 2026). Each line says what is missing and
 * opens the review list for it - nothing is saved until the person does.
 *
 * New messages first (they are the newest payments), then payments Find the
 * difference found missing. With neither known but a gap, Find the difference
 * itself, which finds and fixes it. Nothing when there is no gap and nothing
 * waiting.
 */
export type BankGapLine =
  | { kind: 'new-sms'; testID: string; title: string; href: string }
  | { kind: 'missing'; testID: string; title: string; href: string; missing: NonNullable<Leftover['missing']> }
  | { kind: 'difference'; testID: string; title: string; href: string };

export const missingPaymentsTitle = (count: number): string =>
  `${count} M-Pesa ${count === 1 ? 'payment' : 'payments'} not in Jamvi yet`;

export function bankGapLines({ newSmsCount, left, gap }: {
  newSmsCount: number;
  left: Leftover | null;
  gap: number;
}): BankGapLine[] {
  const lines: BankGapLine[] = [];
  if (newSmsCount > 0) {
    lines.push({ kind: 'new-sms', testID: 'bank-new-sms', title: newSmsTitle(newSmsCount), href: '/mpesa-import?fromSms=new' });
  }
  const missing = left?.missing;
  if (missing?.count) {
    lines.push({
      kind: 'missing',
      testID: 'bank-missing-payments',
      title: missingPaymentsTitle(missing.count),
      href: `/mpesa-import?smsFrom=${missing.from}&smsTo=${missing.to}&missing=1`,
      missing,
    });
  }
  if (lines.length === 0 && Math.abs(gap) >= 0.01) {
    lines.push({ kind: 'difference', testID: 'bank-find-difference', title: 'Jamvi differs from your M-Pesa', href: '/mpesa-difference' });
  }
  return lines;
}
