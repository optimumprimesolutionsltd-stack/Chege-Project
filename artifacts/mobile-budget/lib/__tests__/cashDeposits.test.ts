import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { withCashDeposits } from '../cashDeposits';
import type { Choice, PreviewLine } from '../mpesaImport';

// "Still showing 22 messages" (11 Oct 2026): 16 were cash deposits, never saved.
describe('cash put on M-Pesa at an agent', () => {
  const line = (index: number, type: string, direction: 'in' | 'out' = 'in') => ({ index, type, direction, status: 'ready', receipt: `TE${index}AAAA0`, amount: 1000, description: 'Cash deposit', date: '2026-05-01' } as unknown as PreviewLine);
  const choice = { include: true, category: '', incomeSourceId: null } as unknown as Choice;

  it('starts as a move from the Cash account, confirmed', () => {
    const lines = [line(0, 'cash_deposit'), line(1, 'person_receipt')];
    const next = withCashDeposits(lines, { 0: choice, 1: choice }, [{ id: 3, name: 'Equity' }, { id: 7, name: 'Cash' }]);
    expect(next[0]).toMatchObject({ transferTo: 7, incomeSourceId: null, confirmed: true });
    expect(next[1]).toBe(choice);
  });

  it('takes cash out at an agent as a move into the Cash account', () => {
    const lines = [line(0, 'cash_withdrawal', 'out'), line(1, 'paybill_payment', 'out')];
    const next = withCashDeposits(lines, { 0: choice, 1: choice }, [{ id: 7, name: 'Cash' }]);
    expect(next[0]).toMatchObject({ transferTo: 7, confirmed: true });
    expect(next[1]).toBe(choice);
  });

  it('stays money in, to be sorted out, when there is no Cash account', () => {
    const choices = { 0: choice };
    expect(withCashDeposits([line(0, 'cash_deposit')], choices, [{ id: 3, name: 'Equity' }])).toBe(choices);
  });

  it('is applied when the import starts its choices', () => {
    expect(readFileSync('app/mpesa-import.tsx', 'utf8')).toContain('withOwnAccounts(shown, withCashDeposits(shown, fresh, ownAccounts), ownAccounts, rules)');
  });
});
