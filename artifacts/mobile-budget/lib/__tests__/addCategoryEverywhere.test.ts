import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// "Check where else this logic is needed": a budget and a new group wherever a category is added.
describe('every phone form that adds a category offers a budget and a new group', () => {
  it('Add expense', () => {
    expect(readFileSync('app/add-expense.tsx', 'utf8')).toContain('testID="create-category-parent-new-group"');
  });

  it('Enter a whole day', () => {
    expect(readFileSync('app/bank-day.tsx', 'utf8')).toContain('testID={`${testID}-new-parent-new-group`}');
  });

  it('Bank, money out: a budget too', () => {
    const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
    expect(bank).toContain('testID="bank-new-category-parent-new-group"');
    expect(bank).toContain('testID="bank-new-category-budget"');
  });
});
