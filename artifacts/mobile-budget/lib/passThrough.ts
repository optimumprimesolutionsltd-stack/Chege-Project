/**
 * Money that only passed through your M-Pesa, sorted out as a pair.
 *
 * "How do you sort out money coming in and going out of my phone, that is
 * someone being paid through my M-Pesa?" (8 Oct 2026). Both halves are already
 * imported, so nothing new is written (app/pass-through writes two new postings,
 * which beside imported ones would count the money twice). The two entries are
 * each sorted out as a debt (api-server lib/sort-as-debt), so neither is income
 * or spending:
 *
 *  - held:   "I was holding it for someone" - one person. Money in: borrowed
 *            from them; money out: paying them back. The two cancel.
 *  - settle: "Someone who owed me paid someone I owe" - two people. Money in:
 *            the first paying you back; money out: paying the second. Both
 *            debts come down.
 */

import type { DebtKind } from './sortAsDebt';

export type PassThroughMode = 'held' | 'settle';

/** What each half is sorted out as, and with whom. */
export function passThroughKinds(mode: PassThroughMode): { in: DebtKind; out: DebtKind } {
  return mode === 'held' ? { in: 'borrowed', out: 'pay-back' } : { in: 'repaid', out: 'pay-back' };
}

/** A row of the account, as /api/joint-account lists it. */
export type LedgerRow = {
  id: number;
  type: string;
  amount: number | string;
  date: string;
  description?: string | null;
  bankTransferId?: number | null;
  savingsGoalId?: number | null;
  transferDirection?: string | null;
  chargeForTransactionId?: number | null;
  isLending?: boolean | null;
  isBorrowing?: boolean | null;
  settlesContributorId?: number | null;
  reversal?: unknown;
};

/** Days either side of the entry to look for its other half. */
export const PAIR_WINDOW_DAYS = 7;

const dayNumber = (date: string) => Math.round(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / 86_400_000);

/**
 * The entries that could be the other half: the other direction, within a week,
 * not a move between your own accounts, a fee, a reversal or already a debt.
 * Same amount first, then the nearest amount, then the nearest day.
 */
export function pairCandidates<T extends LedgerRow>(
  entry: { id: number; direction: 'in' | 'out'; amount: number; date: string },
  rows: readonly T[],
  windowDays = PAIR_WINDOW_DAYS,
): T[] {
  const wanted = entry.direction === 'in' ? 'disbursement' : 'deposit';
  const day = dayNumber(entry.date);
  const cents = (value: number | string) => Math.round(Number(value) * 100);
  const target = cents(entry.amount);
  return rows
    .filter((row) =>
      row.id !== entry.id &&
      row.type === wanted &&
      Math.abs(dayNumber(row.date) - day) <= windowDays &&
      row.bankTransferId == null &&
      row.savingsGoalId == null &&
      row.transferDirection == null &&
      row.chargeForTransactionId == null &&
      !row.isLending &&
      !row.isBorrowing &&
      row.settlesContributorId == null &&
      !row.reversal)
    .map((row) => ({ row, off: Math.abs(cents(row.amount) - target), days: Math.abs(dayNumber(row.date) - day) }))
    .sort((a, b) => (a.off === 0) !== (b.off === 0) ? (a.off === 0 ? -1 : 1) : a.off - b.off || a.days - b.days || a.row.id - b.row.id)
    .slice(0, 20)
    .map(({ row }) => row);
}

/** The line for Undo and the confirmation. */
export function pairSummary(mode: PassThroughMode, names: { owner: string; payee?: string | null }): string {
  return mode === 'held'
    ? `Passed through for ${names.owner}`
    : `${names.owner} paid ${names.payee ?? 'someone you owe'} through you`;
}
