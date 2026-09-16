import { type DebtCategory, type PayoffStrategy, rankDebtsForPayoff } from '@/lib/debts';

/**
 * What a debt looks like once you ask the only question that matters to
 * somebody paying one off: when does this end?
 *
 * Ranking told people which debt to attack. It never told them whether they
 * were winning. These figures are the difference between a balance sitting in
 * a category and a plan with an end date on it.
 */

export interface DebtWithPayment extends DebtCategory {
  /** What this category is budgeted to receive each month, in KES. */
  monthlyPayment: number | null;
}

export interface DebtProjection {
  /** Months until the balance reaches zero, or null when it never does. */
  months: number | null;
  /** The month it clears, as YYYY-MM, or null when it never does. */
  clearsOn: string | null;
  /** Interest paid between now and then, in KES. Null when it never clears. */
  interestCost: number | null;
  /** Why there is no projection, for saying so plainly rather than showing a blank. */
  blockedBy: 'no-payment' | 'interest-outruns-payment' | null;
}

/** A hard stop on the simulation: past this, "never" is the honest answer. */
const MAX_MONTHS = 600;

/**
 * Months to clear a balance, paying `monthlyPayment` and accruing interest
 * monthly. Simulated rather than solved with a formula so that the
 * interest-outruns-payment case falls out naturally instead of producing a
 * negative or imaginary number that would have to be special-cased anyway.
 */
export function projectPayoff(
  balance: number,
  monthlyPayment: number | null,
  rateBps: number | null,
  from: Date = new Date(),
): DebtProjection {
  if (balance <= 0) {
    return { months: 0, clearsOn: monthKey(from), interestCost: 0, blockedBy: null };
  }
  if (!monthlyPayment || monthlyPayment <= 0) {
    return { months: null, clearsOn: null, interestCost: null, blockedBy: 'no-payment' };
  }

  const monthlyRate = (rateBps ?? 0) / 10_000 / 12;
  let remaining = balance;
  let interest = 0;

  for (let month = 1; month <= MAX_MONTHS; month += 1) {
    const charged = remaining * monthlyRate;
    // A payment that does not cover the interest never reduces anything, and
    // saying "50 years" would dress that up as progress.
    if (charged >= monthlyPayment) {
      return { months: null, clearsOn: null, interestCost: null, blockedBy: 'interest-outruns-payment' };
    }
    interest += charged;
    remaining = remaining + charged - monthlyPayment;
    if (remaining <= 0) {
      return {
        months: month,
        clearsOn: monthKey(addMonths(from, month)),
        interestCost: Math.round(interest),
        blockedBy: null,
      };
    }
  }
  return { months: null, clearsOn: null, interestCost: null, blockedBy: 'interest-outruns-payment' };
}

export interface DebtOverview {
  /** Every tracked debt, in the order the chosen strategy would attack them. */
  ranked: DebtWithPayment[];
  /** Total still owed across every tracked debt, in KES. */
  totalOwed: number;
  /** Total budgeted towards debt each month, in KES. */
  monthlyCommitment: number;
  /** The debt the strategy says to put spare money into, if any. */
  focus: DebtWithPayment | null;
  /** When the last debt clears, assuming each keeps its own payment. */
  debtFreeOn: string | null;
  /** True when at least one debt has no payment or cannot be cleared. */
  hasStalledDebt: boolean;
  /** Debts already at zero — kept, because clearing one is the point. */
  clearedCount: number;
}

export function summariseDebts(
  categories: readonly DebtWithPayment[],
  strategy: PayoffStrategy,
  from: Date = new Date(),
): DebtOverview {
  const ranked = rankDebtsForPayoff(categories, strategy) as DebtWithPayment[];
  const outstanding = ranked.filter((debt) => (debt.debtBalance ?? 0) > 0);

  const totalOwed = outstanding.reduce((sum, debt) => sum + (debt.debtBalance ?? 0), 0);
  const monthlyCommitment = outstanding.reduce((sum, debt) => sum + (debt.monthlyPayment ?? 0), 0);

  let debtFreeOn: string | null = outstanding.length > 0 ? '' : null;
  let hasStalledDebt = false;
  for (const debt of outstanding) {
    const projection = projectPayoff(debt.debtBalance ?? 0, debt.monthlyPayment, debt.debtInterestRateBps, from);
    if (!projection.clearsOn) {
      hasStalledDebt = true;
      debtFreeOn = null;
      continue;
    }
    // The last one to clear is when the whole thing is over.
    if (debtFreeOn !== null && projection.clearsOn > debtFreeOn) debtFreeOn = projection.clearsOn;
  }
  if (debtFreeOn === '') debtFreeOn = null;

  return {
    ranked,
    totalOwed,
    monthlyCommitment,
    focus: outstanding[0] ?? null,
    debtFreeOn: hasStalledDebt ? null : debtFreeOn,
    hasStalledDebt,
    clearedCount: ranked.length - outstanding.length,
  };
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
}

/** "March 2027" from a YYYY-MM, for saying the date out loud. */
export function formatMonthKey(key: string | null): string | null {
  if (!key) return null;
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return null;
  return new Date(year, month - 1, 1).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' });
}
