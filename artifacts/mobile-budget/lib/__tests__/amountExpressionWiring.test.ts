import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
const expense = readFileSync('app/add-expense.tsx', 'utf8');
const bankDay = readFileSync('app/bank-day.tsx', 'utf8');
const amounts = readFileSync('lib/bankAmount.ts', 'utf8');
// add-expense.tsx and bank-day.tsx share the calc-row buttons through this
// component now, rather than each carrying its own copy — see its own
// comment for why (tabs)/bank.tsx keeps a separate inline copy for now.
const calcRow = readFileSync('components/AmountCalcRow.tsx', 'utf8');

// Working out a day's receipts meant leaving for a calculator and coming back
// with a number, losing the sitting on the way.
describe('the amount fields do arithmetic', () => {
  it('reads an expression where the bank reads an amount', () => {
    // The helpers moved to lib/bankAmount.ts when the day screen needed them
    // too: an amount accepted on one screen and refused on the other is a
    // difference nobody could explain afterwards.
    expect(amounts).toContain('export function readAmount(value: string): number | null {');
    expect(amounts).toContain('return parseBankAmount(value) ?? evaluateAmountExpression(value);');
    expect(bank).toContain("import { parseBankAmount, parseBalanceFigure, readAmount, toMoney } from '@/lib/bankAmount';");
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
    expect(calcRow).toContain('testID={`${testIDPrefix}-key-equals`}');
  });

  it('keeps the numeric keypad and puts the operators beside it', () => {
    // A full keyboard would make every plain amount harder to type for the
    // sake of the occasional sum. (tabs)/bank.tsx still carries its own inline
    // copy of the row; add-expense.tsx and bank-day.tsx share this one.
    expect(bank).toContain('keyboardType="decimal-pad"');
    expect(expense).toContain('keyboardType="numeric"');
    expect(bankDay).toContain('keyboardType="decimal-pad"');
    expect(calcRow).toContain("(['+', '−', '×', '÷', '(', ')'] as const).map((key) => (");
    expect(calcRow).toContain('.slice(0, -1)');
    for (const source of [expense, bankDay]) {
      expect(source).toContain('<AmountCalcRow');
    }
  });

  it('shows the working only when there is working to show', () => {
    // No point printing "= 5,000" under a field that says 5000.
    expect(bank).toContain('{isAmountExpression(amount) && parsedOutgoingAmount !== null ? (');
    expect(calcRow).toContain('{isAmountExpression(amount) ? (');
    expect(bank).toContain('testID="bank-amount-resolved"');
    expect(calcRow).toContain('testID={`${testIDPrefix}-resolved`}');
  });

  it('never evaluates what somebody typed', () => {
    const parser = readFileSync('lib/amountExpression.ts', 'utf8');
    expect(parser).not.toContain('eval(');
    expect(parser).not.toContain('new Function');
  });
});

// A full number pad is twelve keys nobody asked for on the common case of
// typing a plain amount off the device's own keypad, so it sits behind a
// toggle instead of always on screen.
describe('the full number pad stays out of the way until asked for', () => {
  it('starts hidden', () => {
    expect(calcRow).toContain('const [showKeypad, setShowKeypad] = useState(false);');
  });

  it('has a toggle that shows and hides it', () => {
    expect(calcRow).toContain('testID={`${testIDPrefix}-toggle-keypad`}');
    expect(calcRow).toContain('onPress={() => setShowKeypad((current) => !current)}');
  });

  it('carries every digit and a decimal point', () => {
    expect(calcRow).toContain("const DIGIT_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.'] as const;");
    expect(calcRow).toContain('testID={`${testIDPrefix}-digit-${key}`}');
  });
});
