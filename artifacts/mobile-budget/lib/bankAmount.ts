/**
 * Reading what somebody typed into an amount field.
 *
 * Shared because there are now two places a day's banking is entered — one
 * posting at a time, and a whole day at once — and an amount that is accepted
 * on one screen and refused on the other is the sort of difference nobody can
 * explain afterwards.
 */

import { evaluateAmountExpression } from '@/lib/amountExpression';

/** A plain amount: digits, an optional two decimals, commas ignored. */
export function parseBankAmount(value: string): number | null {
  const normalized = value.trim().replace(/,/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A balance, which unlike an amount can be negative.
 *
 * Jamvi records an overdraft rather than refusing it, so a statement figure
 * below zero is a real thing somebody has to be able to type in.
 */
export function parseBalanceFigure(value: string): number | null {
  const normalized = value.trim().replace(/,/g, '');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * What the person meant by what they typed: a number, or the arithmetic that
 * works one out. A day's spending arrives as several receipts that make one
 * posting, and leaving for a calculator loses the sitting.
 */
export function readAmount(value: string): number | null {
  return parseBankAmount(value) ?? evaluateAmountExpression(value);
}

/**
 * A figure fit to be stored as money.
 *
 * Balances take two decimals now, and arithmetic on them does not: 0.1 + 0.2
 * is 0.30000000000000004, which the API refuses and no one can read. Rounding
 * to the cent is not a loss of precision here, it is the precision.
 */
export function toMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
