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
