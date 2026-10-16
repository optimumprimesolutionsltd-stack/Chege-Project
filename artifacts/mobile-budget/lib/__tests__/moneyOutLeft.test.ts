import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leftToPayLine, previewFor } from '../leftToPay';

// "Would also want to see pending balance as per budget when entries are being made" (16 Oct 2026).
describe('what is left on the budget, for any payment being typed', () => {
  it('says what is left, paid in full, or over', () => {
    expect(leftToPayLine(previewFor('Rent', 5000, 20000, 10000)!, 'October').text).toBe('KES 5,000 left to pay on Rent after this - KES 10,000 of KES 20,000 paid before it.');
    expect(leftToPayLine(previewFor('Rent', 10000, 20000, 10000)!, 'October').tone).toBe('paid');
    expect(leftToPayLine(previewFor('Rent', 12000, 20000, 10000)!, 'October').tone).toBe('over');
  });

  it('says nothing for a category with no budget, or before an amount', () => {
    expect(previewFor('Fuel', 1000, 0, 0)).toBeNull();
    expect(previewFor('Rent', 0, 20000, 0)).toBeNull();
  });

  it('is on Money out, for new spending, from the entry month\'s budget', () => {
    const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
    expect(bank).toContain('const { data: entryBreakdown = [] } = useGetDashboardCategoryBreakdown(entryMonth, live);');
    expect(bank).toContain('testID="bank-money-out-left"');
    expect(bank).toContain("if (!modalVisible || txType !== 'disbursement' || editingTransactionId !== null");
  });
});

// "Can i also see balance to fulfill a budget in money in" (16 Oct 2026).
describe('Money in against the month\'s budget', () => {
  it('says how much more has to come in, or that it is covered', async () => {
    const { budgetFundingLine } = await import('../leftToPay');
    expect(budgetFundingLine(120000, 60000, 20000, 'October')!.text).toBe("After this, KES 40,000 more to come in to cover October's budget of KES 120,000 (KES 80,000 in so far).");
    expect(budgetFundingLine(120000, 100000, 20000, 'October')!.text).toBe("This covers October's budget of KES 120,000 in full.");
    expect(budgetFundingLine(120000, 110000, 20000, 'October')!.text).toBe("This covers October's budget of KES 120,000, with KES 10,000 to spare.");
    expect(budgetFundingLine(0, 0, 20000, 'October')).toBeNull();
  });

  it('is on new money in that is income, from the entry month', () => {
    const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
    expect(bank).toContain('const { data: entryIncome } = useGetDashboardIncomeLedger(entryMonth, live);');
    expect(bank).toContain('testID="bank-money-in-funding"');
    expect(bank).toContain("if (!modalVisible || txType !== 'deposit' || editingTransactionId !== null || notIncome || toBusinessId !== null || forBusinessId !== null) return null;");
  });
});
