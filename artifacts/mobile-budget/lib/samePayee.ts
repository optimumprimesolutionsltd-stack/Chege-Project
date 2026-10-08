/**
 * Correct one payment's category, and the rest from that payee follow.
 *
 * "Eagles African Dishes" was filed under Boda boda and matatu instead of Eat
 * outs - "this problem is common. If the app sees this can it sort out the rest
 * in different periods?" (8 Oct 2026). When a payment's category is changed on
 * Bank, the other payments to the same payee still under the old category (or
 * Not sure yet), in any month, are offered to move with it, and the payee is
 * remembered so the next import files it right (payeeLearning).
 */
import { isNotSure } from './entriesToSort';
import { payeeKey } from './payeeLearning';

type Row = {
  id: number;
  type: string;
  amount: number | string;
  date: string;
  description?: string | null;
  expenseCategory?: string | null;
  bankTransferId?: number | string | null;
  savingsGoalId?: number | string | null;
  chargeForTransactionId?: number | string | null;
  expenseId?: number | string | null;
  isLending?: boolean | null;
  settlesContributorId?: number | null;
  reversal?: unknown;
};

const same = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').trim().toLocaleLowerCase('en-KE') === (b ?? '').trim().toLocaleLowerCase('en-KE');

/**
 * Other payments to the payee of `edited` that are still under `from` or Not
 * sure yet: plain spending only, never a fee, a transfer, a debt payment or a
 * reversal. Oldest first.
 */
export function samePayeeToMove<T extends Row>(rows: readonly T[], edited: { id: number; description: string }, from: string, to: string): T[] {
  const key = payeeKey(edited.description);
  if (!key || !to.trim() || isNotSure(to) || same(from, to)) return [];
  return rows
    .filter((row) =>
      row.id !== edited.id &&
      row.type === 'disbursement' &&
      row.bankTransferId == null &&
      row.savingsGoalId == null &&
      row.chargeForTransactionId == null &&
      row.expenseId == null &&
      !row.isLending &&
      row.settlesContributorId == null &&
      !row.reversal &&
      !!row.description && payeeKey(row.description) === key &&
      (same(row.expenseCategory, from) || isNotSure(row.expenseCategory)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthOf = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1] ?? ''} ${date.slice(0, 4)}`;

/** "12 payments, KES 6,000, Mar 2026 - Sep 2026". */
export function moveSummary(rows: ReadonlyArray<Pick<Row, 'amount' | 'date'>>): string {
  if (rows.length === 0) return '';
  const total = rows.reduce((sum, row) => sum + Number(row.amount), 0);
  const first = monthOf(rows[0].date);
  const last = monthOf(rows[rows.length - 1].date);
  return `${rows.length} ${rows.length === 1 ? 'payment' : 'payments'}, KES ${Math.round(total).toLocaleString('en-KE')}, ${first === last ? first : `${first} – ${last}`}`;
}
