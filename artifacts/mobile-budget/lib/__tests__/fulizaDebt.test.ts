import { describe, expect, it } from 'vitest';
import { buildPostings, problemWith, type Choice, type PreviewLine } from '../mpesaImport';
import { findFulizaParty, FULIZA_PARTY_NAME, needsFulizaParty, withFulizaDebt } from '../mpesaDebts';

const line = (index: number, type: string, direction: 'in' | 'out', amount: number): PreviewLine => ({
  index, status: 'ready', reason: null, receipt: `F${index}`, direction, type, amount, description: type, date: '2026-10-05', fee: null, mpesaBalance: null, alreadyRecorded: null,
});
const choice = (over: Partial<Choice> = {}): Choice => ({ include: true, category: '', ...over });
const ctx = { accountId: 1, userId: 'u', isShared: false, today: '2026-10-05', chargeCategory: '' };

// Fuliza still owed was borrowed; paying it back next month was going to be
// filed as spending, counting what the loan bought twice.
describe('Fuliza in Who owes who', () => {
  const lines = [line(0, 'fuliza_borrowed', 'in', 3178.08), line(1, 'fuliza_repaid', 'out', 3178.08), line(2, 'person_payment', 'out', 100)];

  it('is found by name, and needed only for ticked, unlinked Fuliza lines', () => {
    expect(findFulizaParty([{ id: 7, name: ' fuliza ' }])?.id).toBe(7);
    expect(needsFulizaParty(lines, { 0: choice(), 1: choice(), 2: choice() })).toBe(true);
    expect(needsFulizaParty(lines, { 0: choice({ include: false }), 1: choice({ include: false }), 2: choice() })).toBe(false);
  });

  it('links the borrowing and the repayment to it, leaving other lines and chosen links alone', () => {
    const linked = withFulizaDebt(lines, { 0: choice({ incomeSourceId: 3 }), 1: choice({ category: 'Fuliza charges', auto: true }), 2: choice() }, 7);
    expect(linked[0]).toMatchObject({ debt: { kind: 'borrowed', partyId: 7 }, incomeSourceId: null });
    expect(linked[1]).toMatchObject({ debt: { kind: 'pay-back', partyId: 7 }, category: '' });
    expect(linked[2].debt).toBeUndefined();
  });

  it('lets the repayment save with no category, as paying off that debt, not as spending', () => {
    const repay = choice({ debt: { kind: 'pay-back', partyId: 7 } });
    expect(problemWith(lines[1], repay)).toBeNull();
    expect(problemWith(lines[1], choice())).toBeNull();
    expect(problemWith(lines[2], choice())).toBe('Choose what it was for.');
    const built = buildPostings(lines[1], repay, ctx) as { main: Record<string, unknown> };
    expect(built.main).toMatchObject({ settlesContributorId: 7 });
    expect(built.main.expenseCategory).toBeUndefined();
  });

  it('saves the borrowing as borrowing', () => {
    const built = buildPostings(lines[0], choice({ debt: { kind: 'borrowed', partyId: 7 } }), ctx) as { main: Record<string, unknown> };
    expect(built.main).toMatchObject({ isBorrowing: true });
  });
});

// "Safaricom should be in the app as a creditor" - it was "Safaricom PLC" until
// 5 Oct 2026, when each M-Pesa lender got its own name: Fuliza.
describe('the Fuliza creditor', () => {
  it('is added as Fuliza, and an existing Safaricom or Fuliza entry is used', () => {
    expect(FULIZA_PARTY_NAME).toBe('Fuliza');
    expect(findFulizaParty([{ id: 3, name: 'Safaricom PLC' }])?.id).toBe(3);
    expect(findFulizaParty([{ id: 4, name: 'Safaricom' }])?.id).toBe(4);
    expect(findFulizaParty([{ id: 5, name: 'Hermda trders' }])).toBeNull();
  });
});
