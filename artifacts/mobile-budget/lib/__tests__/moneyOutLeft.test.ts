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
