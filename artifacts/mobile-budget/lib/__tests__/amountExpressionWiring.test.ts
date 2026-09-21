import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
const expense = readFileSync('app/add-expense.tsx', 'utf8');

// Working out a day's receipts meant leaving for a calculator and coming back
// with a number, losing the sitting on the way.
describe('the amount fields do arithmetic', () => {
  it('reads an expression where the bank reads an amount', () => {
    expect(bank).toContain('function readAmount(value: string): number | null {');
    expect(bank).toContain('return parseBankAmount(value) ?? evaluateAmountExpression(value);');
    expect(bank).toContain("const parsed = amount.trim() === '' && editingTransactionId !== null ? 0 : readAmount(amount);");
  });

  it('projects the balance from the worked-out figure, not the typed text', () => {
    // Otherwise the balance stops moving the moment a "+" is typed.
    expect(bank).toContain('const parsedOutgoingAmount = readAmount(amount);');
  });

  it('collapses the expression into the expense field instead', () => {
    // A dozen places downstream read that field with Number(), so resolving at
    // each of them is a dozen chances to miss one.
    expect(expense).toContain('if (isAmountExpression(amount) && resolved !== null) setAmount(String(resolved));');
    expect(expense).toContain('testID="expense-amount-key-equals"');
  });

  it('keeps the numeric keypad and puts the operators beside it', () => {
    // A full keyboard would make every plain amount harder to type for the
    // sake of the occasional sum.
    expect(bank).toContain('keyboardType="decimal-pad"');
    expect(expense).toContain('keyboardType="numeric"');
    for (const source of [bank, expense]) {
      expect(source).toContain("(['+', '−', '×', '÷', '(', ')'] as const).map((key) => (");
      expect(source).toContain('previous.slice(0, -1)');
    }
  });

  it('shows the working only when there is working to show', () => {
    // No point printing "= 5,000" under a field that says 5000.
    expect(bank).toContain('{isAmountExpression(amount) && parsedOutgoingAmount !== null ? (');
    expect(expense).toContain('{isAmountExpression(amount) ? (');
    expect(bank).toContain('testID="bank-amount-resolved"');
    expect(expense).toContain('testID="expense-amount-resolved"');
  });

  it('never evaluates what somebody typed', () => {
    const parser = readFileSync('lib/amountExpression.ts', 'utf8');
    expect(parser).not.toContain('eval(');
    expect(parser).not.toContain('new Function');
  });
});
