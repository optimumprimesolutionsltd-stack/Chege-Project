import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');

// "Where is this money going? → Savings" built an ordinary disbursement whose
// description happened to mention the goal. The goal was never credited, the
// posting counted as spending, and it had to borrow a category to do it — so
// money set aside read exactly like money consumed.
describe('a withdrawal into savings is a transfer', () => {
  it('credits the goal instead of only naming it', () => {
    const handler = bank.slice(bank.indexOf('const handleSubmit = async ('), bank.indexOf('const transactions: Tx[] ='));
    expect(handler).toContain("if (txType === 'disbursement' && withdrawDest === 'savings') {");
    expect(handler).toContain('await transferBankToSavings({');
  });

  it('classifies it as moved, which follows from the goal being set', () => {
    // The stats row splits on savingsGoalId, so crediting the goal is what
    // moves it out of Spent.
    expect(bank).toContain('tx.bankTransferId != null || tx.savingsGoalId != null');
  });

  it('stops demanding a spending category for it', () => {
    // Money set aside belongs to no category, and the old flow made it borrow
    // one — which is what put it in a budget it had nothing to do with.
    // Lending joined savings in having no category: it is not a cost either.
    expect(bank).toContain("if (txType === 'disbursement' && withdrawDest !== 'savings' && withdrawDest !== 'lend' && !expenseCategory.trim()) {");
    expect(bank).toContain("{isWithdrawal && withdrawDest !== 'savings' && withdrawDest !== 'lend' && (");
  });

  it('keeps the whole-shilling rule savings transfers already have', () => {
    const handler = bank.slice(bank.indexOf("if (txType === 'disbursement' && withdrawDest === 'savings') {"));
    expect(handler.slice(0, 600)).toContain('if (!Number.isInteger(parsed)) {');
  });

  it('still insists on a goal', () => {
    const handler = bank.slice(bank.indexOf("if (txType === 'disbursement' && withdrawDest === 'savings') {"));
    expect(handler.slice(0, 400)).toContain('if (!selectedGoal) {');
  });

  it('offers the savings destination only on a new withdrawal', () => {
    // Turning a saved withdrawal into a transfer would mean deleting and
    // rewriting it behind the person's back. An existing savings transfer
    // already opens in the Transfer sheet.
    expect(bank).toContain('if (editingTransactionId !== null) return null;');
    expect(bank).toContain("const type: TxType = tx.savingsGoalId");
  });

  it('takes part in a sitting like every other posting', () => {
    const handler = bank.slice(bank.indexOf('const handleSubmit = async ('), bank.indexOf('const transactions: Tx[] ='));
    expect(handler).toContain("finishEntry(keepOpen, { amount: parsed, direction: 'out' });");
  });
});

// Four options in one row gave each about eighty points, so "To savings" and
// "Between accounts" ran into each other and broke mid-word. They are also the
// same idea — money moved rather than spent — so they belong behind one answer.
describe('one Transfer, then which kind', () => {
  it('leaves three options in the row, not four', () => {
    expect(bank).toContain('testID="bank-toggle-transfer"');
    expect(bank).not.toContain('testID="bank-toggle-bank-transfer"');
  });

  it('shows the choice only once Transfer is chosen', () => {
    expect(bank).toContain('testID="bank-transfer-kind"');
    expect(bank).toContain('{editingTransactionId === null && isMovingMoney ? (');
  });

  it('offers both kinds, each as its own control', () => {
    expect(bank).toContain('testID="bank-transfer-kind-savings"');
    expect(bank).toContain('testID="bank-transfer-kind-accounts"');
  });

  it('treats both as the one Transfer answer', () => {
    expect(bank).toContain('const isMovingMoney = isTransfer || isBankTransfer;');
  });

  it('gives each its own line rather than sharing one', () => {
    // flex: 1 on each, so neither has to wrap to fit the other in.
    expect(bank).toContain('transferKindOption: {');
  });

  it('stays hidden while editing, type being fixed then', () => {
    expect(bank).toContain('{editingTransactionId === null && isMovingMoney ? (');
  });
});
