import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const budget = readFileSync('app/(tabs)/budget.tsx', 'utf8');

describe('mobile budget summary ledger entry point', () => {
  it('makes the overall budget summary actionable and explains what it represents', () => {
    expect(budget).toContain('testID="budget-overall-ledger"');
    expect(budget).toContain('Tap to view ledger and manage');
    expect(budget).toContain('setLedgerCategory({ category: category.name, isBudgeted: true })');
  });

  it('keeps budget editing and removal available from the opened ledger', () => {
    expect(budget).toContain('Edit ${ledgerBudgetCategory.name} budget');
    expect(budget).toContain('Remove ${ledgerBudgetCategory.name} budget');
    expect(budget).toContain('handleDelete(ledgerBudgetCategory)');
  });
});