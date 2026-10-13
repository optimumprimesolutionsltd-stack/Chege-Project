import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { budgetRowLeft, leftToPayLine } from '@/lib/leftToPay';

// "i want to know when i have been able to fully pay for rent to her so i can
// go to the next thing" (13 Oct 2026): rent sent in small amounts.
const rent = { category: 'Rent', budgetAmount: 25000 };

describe('what is left to pay after this payment', () => {
  it('says how much is left, and how much was paid before', () => {
    expect(leftToPayLine({ ...rent, spentBeforeExpense: 10000, remaining: 10000, overBy: 0, isOverBudget: false }, 'October'))
      .toEqual({ tone: 'left', text: 'KES 10,000 left to pay on Rent after this - KES 10,000 of KES 25,000 paid before it.' });
    expect(leftToPayLine({ ...rent, spentBeforeExpense: 0, remaining: 20000, overBy: 0, isOverBudget: false }, 'October').text)
      .toBe('KES 20,000 left to pay on Rent after this, of KES 25,000.');
  });

  it('says plainly when this payment finishes it', () => {
    expect(leftToPayLine({ ...rent, spentBeforeExpense: 20000, remaining: 0, overBy: 0, isOverBudget: false }, 'October'))
      .toEqual({ tone: 'paid', text: 'This pays Rent in full for October (KES 25,000). On to the next thing.' });
  });

  it('says when it was already paid, or this goes over', () => {
    expect(leftToPayLine({ ...rent, spentBeforeExpense: 25000, remaining: 0, overBy: 2000, isOverBudget: true }, 'October').text)
      .toBe('Rent is already fully paid for October (KES 25,000). This puts it KES 2,000 over.');
    expect(leftToPayLine({ ...rent, spentBeforeExpense: 20000, remaining: 0, overBy: 1000, isOverBudget: true }, 'October').text)
      .toBe('This pays Rent in full for October and KES 1,000 over the KES 25,000.');
  });

  it('a Budget row says Fully paid instead of KES 0 left', () => {
    expect(budgetRowLeft(25000, 25000)).toBe('Fully paid');
    expect(budgetRowLeft(25000, 15000)).toBe('KES 10,000 left');
    expect(budgetRowLeft(25000, 26000)).toBe('KES 1,000 over');
    expect(budgetRowLeft(0, 500)).toBe('');
  });

  it('shows on Log Expense in Quick as well as Detailed, and on the Budget tab', () => {
    const screen = readFileSync('app/add-expense.tsx', 'utf8');
    expect(screen).toContain('{category ? (() => {');
    expect(screen).toContain('testID="expense-left-to-pay"');
    expect(screen).not.toContain('{isAdvanced && category ? (() => {');
    expect(readFileSync('app/(tabs)/budget.tsx', 'utf8')).toContain('budgetRowLeft(cat.budgetAmount, cat.spentAmount)');
  });
});
