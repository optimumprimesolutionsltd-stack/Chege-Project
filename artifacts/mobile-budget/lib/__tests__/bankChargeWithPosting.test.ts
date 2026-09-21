import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');

// Paying a loan through the bank costs the payment and the bank's fee, and
// they arrive together. Recording them meant two full trips through the sheet,
// re-entering the date, the account and the payee to say KES 50.
describe('a withdrawal can carry its bank charge', () => {
  it('is asked for on the withdrawal itself', () => {
    expect(bank).toContain('testID="bank-charge-block"');
    expect(bank).toContain('testID="bank-charge-amount"');
  });

  it('is offered on withdrawals only', () => {
    expect(bank).toContain('{isWithdrawal ? (');
  });

  it('is optional, and blank means none', () => {
    expect(bank).toContain("const parsedCharge = chargeAmount.trim() === '' ? 0 : readAmount(chargeAmount);");
  });

  it('takes arithmetic like every other amount field', () => {
    expect(bank).toContain('readAmount(chargeAmount)');
  });
});

describe('it is a second posting, never part of the first', () => {
  it('is saved on its own', () => {
    // Folded into the amount, a repayment of 5,000 with a 50 charge would
    // offer to take 5,050 off the loan when only 5,000 reached it, and the
    // balance would drift by the fee every time.
    expect(bank).toContain('if (chargeToPost > 0) {');
    expect(bank).toContain('description: `Bank charge — ${finalDescription}`,');
  });

  it('carries a category of its own', () => {
    expect(bank).toContain('testID="bank-charge-category"');
    expect(bank).toContain('expenseCategory: chargeCategory.trim(),');
  });

  it('insists on that category before anything is written', () => {
    // Refusing after the withdrawal saved would lose the fee silently.
    expect(bank).toContain("Alert.alert('Where does the charge go?'");
    expect(bank).toContain("Alert.alert('Check the charge'");
  });

  it('is posted after the withdrawal, not before', () => {
    // If the fee fails the withdrawal still stands, which is what the
    // statement will show. The other way round invents a fee for nothing.
    const submit = bank.slice(bank.indexOf('const handleSubmit'));
    expect(submit.indexOf('destinationKind: withdrawDest')).toBeLessThan(submit.indexOf('if (chargeToPost > 0) {'));
  });
});

describe('the figures include it', () => {
  it('falls out of the projected balance as it is typed', () => {
    expect(bank).toContain('parsedOutgoingAmount + chargeToPost,');
  });

  it('counts in the sitting total', () => {
    expect(bank).toContain("amount: parsed + (txType === 'disbursement' ? chargeToPost : 0)");
  });

  it('clears between postings in a sitting', () => {
    // The next line is rarely charged the same fee, and one carried over
    // would be money out that never happened.
    expect((bank.match(/setChargeAmount\(''\);/g) ?? []).length).toBe(2);
  });
});
