import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const bank = readFileSync(join(__dirname, '..', '..', 'app', '(tabs)', 'bank.tsx'), 'utf8');

// "where is the category logic in money in. i cant see it" (17 Oct 2026): Money
// back for a category was offered only on new money in, never on M-Pesa money
// in already saved - which is where a friend's refund usually is.
describe('Money back for a category on money in already saved', () => {
  it('is offered whether the money in is new or saved', () => {
    const option = bank.slice(bank.indexOf("{/* Money back that takes it off a category"), bank.indexOf('testID="bank-deposit-money-back"'));
    expect(option).not.toContain('editingTransactionId === null');
  });

  it('turns the saved entry itself into a refund in that category', () => {
    expect(bank).toContain("if (editingTransactionId !== null && txType === 'deposit' && moneyBackFor !== null) {");
    expect(bank).toContain('await customFetch(`/api/joint-account/${editingTransactionId}/money-back`, {');
    expect(bank).toContain('body: JSON.stringify({ expenseCategory: moneyBackFor.trim() }),');
  });
});
