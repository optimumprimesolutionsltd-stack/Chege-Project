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

// "can we have the suggestion to have all the money from a certain user pushed
// to that category like the way we are doing with money out- ofcourse with a
// manual tick box" (17 Oct 2026).
describe('the same person\'s other money in, after Money back', () => {
  const offer = bank.slice(bank.indexOf('const offerMoneyBackOthers = '), bank.indexOf('const rememberWhoFor = async'));

  it('is found by payer, leaving moves, savings, borrowing and repayments out', () => {
    expect(offer).toContain('samePayeeName(row.description) === who');
    expect(offer).toContain("row.type === 'deposit' && row.bankTransferId == null && row.savingsGoalId == null");
    expect(offer).toContain('!row.isBorrowing && row.settlesContributorId == null');
  });

  it('is only ever changed through the tick-box list', () => {
    expect(offer).toContain('text: `Show the ${others.length}`');
    expect(offer).toContain('offerReview({');
    expect(offer).not.toContain('Move all');
    expect(offer).toContain('change: (ids) => moveBack(others.filter((row) => ids.includes(row.id))),');
    expect(offer).toContain('await customFetch(`/api/joint-account/${row.id}/money-back`, {');
  });

  it('follows a saved money in made money back', () => {
    expect(bank).toContain('if (turned) moneyBackOthers = { id: turned.id, description: turned.description, category: moneyBackFor.trim() };');
    expect(bank).toMatch(/if \(moneyBackOthers\) \{\r?\n\s*offerMoneyBackOthers\(moneyBackOthers\);/);
  });
});
