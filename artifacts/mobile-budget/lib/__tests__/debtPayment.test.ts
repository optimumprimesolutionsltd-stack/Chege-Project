import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
const card = readFileSync('components/DebtPayoffCard.tsx', 'utf8');

// Paying a creditor counted as spending and left what you owe untouched, so
// the Debt tab drifted away from reality one payment at a time.
describe('paying a debt from the bank', () => {
  it('offers to take the payment off what is owed', () => {
    expect(bank).toContain('const offerDebtReduction = (categoryName: string, amount: number) => {');
    expect(bank).toContain('offerDebtReduction(paidCategory, parsed);');
  });

  it('asks rather than applying it', () => {
    // A balance is stored and a posting can be edited or deleted afterwards.
    // If paying reduced it by itself, every one of those paths would have to
    // put it back, and the first that did not would send the balance wrong.
    expect(bank).toContain("{ text: 'Not now', style: 'cancel' },");
    expect(bank).toContain('stays a number you own.');
  });

  it('only asks on a new withdrawal, and reads that before it is cleared', () => {
    // finishEntry clears editingTransactionId, so a check after it would think
    // every save was a new one — and an edit would take the money off twice.
    expect(bank).toContain("const wasNewWithdrawal = txType === 'disbursement' && editingTransactionId === null;");
    const handler = bank.slice(bank.indexOf('const wasNewWithdrawal'), bank.indexOf('offerDebtReduction(paidCategory'));
    expect(handler).toContain('finishEntry(keepOpen');
  });

  it('stays quiet unless the category is actually a debt', () => {
    expect(bank).toContain("typeof row.debtBalance === 'number'");
    expect(bank).toContain('if (!debt || typeof owed !== \'number\' || owed <= 0 || amount <= 0) return;');
  });

  it('never drives the balance below zero, and says when it clears', () => {
    expect(bank).toContain('const remaining = Math.max(0, owed - paid);');
    expect(bank).toContain('This clears it.');
  });

  it('rounds to whole shillings, as the column holds', () => {
    // A debt quoted to the cent is not how anybody is told what they owe.
    expect(bank).toContain('const paid = Math.round(amount);');
  });
});

// I told the user debts could only be managed on a laptop, and shipped that
// into the guide. The editor had been on the phone all along, in a component
// the Debt tab renders.
describe('the phone can manage a debt', () => {
  it('can start tracking one', () => {
    expect(card).toContain('testID="debt-add-open"');
    expect(card).toContain('testID="debt-new-name-input"');
    expect(card).toContain('testID="debt-new-balance-input"');
  });

  it('can change the balance and the rate', () => {
    expect(card).toContain('testID={`debt-edit-${debt.id}`}');
    expect(card).toContain('testID={`debt-balance-input-${debt.id}`}');
    expect(card).toContain('testID={`debt-rate-input-${debt.id}`}');
  });

  it('can stop tracking without losing the category', () => {
    expect(card).toContain('testID={`debt-stop-tracking-${debt.id}`}');
    expect(card).toContain('debtBalance: null, debtInterestRateBps: null');
  });
});
