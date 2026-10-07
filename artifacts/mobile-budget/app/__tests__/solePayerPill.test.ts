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
    // Since 7 Oct 2026 it is a real choice against Bank account ("hard to
    // click Chege"): tapping it means paid directly, and never deselects.
    expect(source).toContain('onToggle={onlyPerson ? payDirectly : togglePayer}');
    expect(source).toContain('setPayerIds((previous) => (previous.includes(userId) ? previous : [userId]));');
  });

  it('says why, rather than just going dead', () => {
    // Going dead silently would leave the same symptom with a different cause.
    // Alone in the budget it reads Bank account or Cash (7 Oct 2026).
    expect(source).toContain('Cash is money you paid from your pocket. Paid with M-Pesa or from a bank? Choose Bank account, then the account.');
    expect(source).toContain("name={onlyPerson ? 'Cash' : m.userName?.split(' ')[0] ?? 'Member'}");
    expect(source).toContain('{soleDirectPayer && (');
  });

  it('explains it to a screen reader too', () => {
    expect(source).toContain('accessibilityHint={');
    expect(source).toContain(
      'Cash: money you paid from your pocket. For M-Pesa or a bank, choose Bank account and pick the account.',
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

// "Paid directly not clickable" (7 Oct 2026): the payer's own amount, filled in
// before any income source was picked, counted as fully funded and greyed out
// every source, so none could be chosen.
describe('Financed by with no source chosen yet', () => {
  it('locks no source until one has been chosen', () => {
    expect(source).toContain('const sourceDisabled = !selected && fundingFulfilled && anySourceChosen;');
  });

  it('shows the source a one-source expense keeps on its payer as chosen', () => {
    expect(source).toContain('const selected = selectedSources.includes(key) || key === implicitKey;');
  });

  it('gives the first source picked the amount already filled in', () => {
    expect(source).toContain('selection.amounts[key] = payerAmounts[paidById];');
  });
});
