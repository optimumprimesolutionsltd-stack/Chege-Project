import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The payer pill in a budget with only one possible payer.
 *
 * It read as broken, and the mechanism is worth writing down because nothing
 * about it is visible in the code that appears to be at fault. The pill is a
 * toggle. A single-payer budget auto-selects that payer from an effect whose
 * dependencies include `payerIds.length`. Deselecting changes that length, so
 * the effect runs again and puts the payer straight back. The tap always
 * worked; it was reverted within the same commit, so nothing moved on screen.
 *
 * The fix is not to weaken the auto-select - it is right, and a personal
 * budget genuinely has nobody else to bill - but to stop the pill offering a
 * choice that does not exist, and to say why.
 */
const source = readFileSync('app/add-expense.tsx', 'utf8');

describe('a budget with one possible payer', () => {
  it('recognises the case', () => {
    expect(source).toContain(
      'const soleDirectPayer = canManageShared && !paidFromBank && selectablePayers.length === 1;',
    );
  });

  it('stops the pill offering a toggle that undoes itself', () => {
    expect(source).toContain('disabled={soleDirectPayer ||');
  });

  it('says why, rather than just going dead', () => {
    // Going dead silently would leave the same symptom with a different cause.
    expect(source).toContain('You are the only person in this budget, so this is paid by you.');
    expect(source).toContain('{soleDirectPayer && (');
  });

  it('explains it to a screen reader too', () => {
    expect(source).toContain('accessibilityHint={');
    expect(source).toContain(
      'You are the only person in this budget, so this expense is recorded as paid by you.',
    );
  });

  it('still lets the bank be chosen instead', () => {
    // soleDirectPayer is false once paidFromBank is on, so the pill becomes a
    // real toggle again for mixed funding.
    expect(source).toContain('canManageShared && !paidFromBank && selectablePayers.length === 1');
  });

  it('leaves the auto-select alone', () => {
    // Weakening this would trade a dead pill for an unfunded expense.
    expect(source).toContain('setPayerIds([selectablePayers[0].userId]);');
  });
});
