import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pairCandidates, pairSummary, passThroughKinds, type LedgerRow } from '@/lib/passThrough';

// "How do you sort out money coming in and going out of my phone, that is
// someone being paid through my M-Pesa?" (8 Oct 2026)
describe('money that passed through, sorted out as a pair', () => {
  it('holding it for someone: borrowed from them, then paid back to them', () => {
    expect(passThroughKinds('held')).toEqual({ in: 'borrowed', out: 'pay-back' });
  });

  it('someone who owed you paying someone you owe: repaid to you, then paying them', () => {
    expect(passThroughKinds('settle')).toEqual({ in: 'repaid', out: 'pay-back' });
  });

  it('says what was done', () => {
    expect(pairSummary('held', { owner: 'Wanjiku' })).toBe('Passed through for Wanjiku');
    expect(pairSummary('settle', { owner: 'Wanjiku', payee: 'John' })).toBe('Wanjiku paid John through you');
  });
});

describe('finding the other half', () => {
  const row = (over: Partial<LedgerRow> & { id: number }): LedgerRow => ({ type: 'disbursement', amount: 5000, date: '2026-08-27', description: 'John', ...over });
  const moneyIn = { id: 1, direction: 'in' as const, amount: 5000, date: '2026-08-27' };

  it('offers money out within a week, same amount first, then the nearest amount and day', () => {
    const rows = [
      row({ id: 2, amount: 4000, date: '2026-08-27' }),
      row({ id: 3, amount: 5000, date: '2026-08-30' }),
      row({ id: 4, amount: 5000, date: '2026-08-27' }),
      row({ id: 5, amount: 5000, date: '2026-09-05' }),
      row({ id: 6, type: 'deposit' }),
    ];
    expect(pairCandidates(moneyIn, rows).map((one) => one.id)).toEqual([4, 3, 2]);
  });

  it('leaves out moves between your own accounts, fees, reversals and entries already a debt', () => {
    const rows = [
      row({ id: 10, bankTransferId: 3 }),
      row({ id: 11, savingsGoalId: 1 }),
      row({ id: 12, chargeForTransactionId: 99 }),
      row({ id: 13, isLending: true }),
      row({ id: 14, settlesContributorId: 7 }),
      row({ id: 15, reversal: { role: 'reversed_payment' } }),
      row({ id: 16 }),
    ];
    expect(pairCandidates(moneyIn, rows).map((one) => one.id)).toEqual([16]);
  });

  it('works from the money out too, offering money in', () => {
    const rows = [row({ id: 20, type: 'deposit', date: '2026-08-26' }), row({ id: 21 })];
    expect(pairCandidates({ id: 21, direction: 'out', amount: 5000, date: '2026-08-27' }, rows).map((one) => one.id)).toEqual([20]);
  });
});

describe('where it is offered', () => {
  it('on every entry in Sort them out, with Undo', () => {
    const screen = readFileSync('app/sort-entries.tsx', 'utf8');
    expect(screen).toContain('testID={`sort-entry-${entry.id}-pass-through`}');
    expect(screen).toContain('<PassThroughPair');
    expect(screen).toContain('setLastChange({ text: change.text, undo: change.undo });');
  });

  it('on an entry opened on Bank', () => {
    const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
    expect(bank).toContain('testID="bank-pass-through-pair"');
    expect(bank).toContain('<PassThroughPair');
  });

  it('marks both halves as debts, and puts the first back if the second fails', () => {
    const sheet = readFileSync('components/PassThroughPair.tsx', 'utf8');
    expect(sheet).toContain('await sortAs(inId, kinds.in, ownerParty.id);');
    expect(sheet).toContain('await sortAs(outId, kinds.out, payeeParty.id);');
    expect(sheet).toContain('if (inDone) await putBack(inId).catch(() => {});');
  });

  it("the server lists each entry's account, so the sheet looks in the right one", () => {
    const route = readFileSync('../api-server/src/routes/entries-to-sort.ts', 'utf8');
    expect(route).toContain('accountId: jointAccountTxTable.accountId,');
  });
});
