import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Choice, PreviewLine } from '../mpesaImport';
import { ownRuleKey, groupKey, withOwnAccounts } from '../teachJamvi';

// "How did it end up in ujenzi distributors in the first place?" (11 Oct 2026): a
// payment whose account number matched the business's account was saved as a move.
describe('a move to your own account', () => {
  const line: PreviewLine = { index: 0, status: 'ready', reason: null, receipt: 'TM1AAA0001', direction: 'out', type: 'paybill_payment', amount: 3000, description: 'Grace Community Chapel (50123)', date: '2026-10-11', fee: null, mpesaBalance: null, alreadyRecorded: null };
  const choice = { include: true, category: 'Not sure yet' } as Choice;
  const accounts = [{ id: 9, name: 'Ujenzi Distributors', accountNumber: '50123' }];

  it('matched only by a number is a question, not a fact', () => {
    const next = withOwnAccounts([line], { 0: choice }, accounts);
    expect(next[0]).toMatchObject({ transferTo: 9, transferAuto: true });
    expect(next[0].confirmed).toBeUndefined();
  });

  it('taught by the person stays their word', () => {
    const rules = { [ownRuleKey(groupKey(line))]: '9' };
    const next = withOwnAccounts([line], { 0: choice }, [{ id: 9, name: 'Ujenzi Distributors', accountNumber: null }], rules);
    expect(next[0]).toMatchObject({ transferTo: 9, confirmed: true });
    expect(next[0].transferAuto).toBeUndefined();
  });

  it('is asked about on the import line, and Bank says plainly how to undo one', () => {
    const screen = readFileSync('app/mpesa-import.tsx', 'utf8');
    expect(screen).toContain('because its number matches that account');
    expect(screen).toContain('This was a payment instead');
    const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
    expect(bank).toContain('`This was a payment, not a move to ${editingTransfer.toName}`');
    // A category no business owns makes the payment Personal, and the payee is not remembered as the business's.
    expect(bank).toContain("const businessStands = txType !== 'disbursement' || costOfCategory.get(expenseCategory.trim()) === forBusinessId;");
  });
});
