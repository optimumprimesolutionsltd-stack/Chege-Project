import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  balanceChanges,
  canLinkDebt,
  debtKindsFor,
  matchParty,
  suggestDebtKind,
  type PartyLite,
} from '@/lib/mpesaDebts';
import { buildPostings, problemWith, type Choice, type PostingContext, type PreviewLine } from '@/lib/mpesaImport';

const line = (over: Partial<PreviewLine>): PreviewLine => ({
  index: 0,
  status: 'ready',
  reason: null,
  receipt: 'TESTX1',
  direction: 'out',
  type: 'person_payment',
  amount: 500,
  description: 'Jeremiah Chege',
  named: true,
  date: '2026-10-24',
  fee: null,
  mpesaBalance: null,
  alreadyRecorded: null,
  ...over,
});

const ctx: PostingContext = { accountId: 9, userId: 'u1', isShared: false, today: '2026-10-25', chargeCategory: 'Bank charges' };
const parties: PartyLite[] = [
  { id: 1, name: 'Jeremiah Chege', owedByUs: 2000, owedToUs: 0 },
  { id: 2, name: 'Lewis', owedByUs: 0, owedToUs: 300 },
  { id: 3, name: 'Mum', owedByUs: null, owedToUs: null },
];

// "Yes, add the debt step": a payment to or from a person can be a debt or a loan.
describe('which lines can be a debt', () => {
  it('only a payment to or from a person', () => {
    expect(canLinkDebt(line({ type: 'person_payment' }))).toBe(true);
    expect(canLinkDebt(line({ type: 'person_receipt', direction: 'in' }))).toBe(true);
    for (const type of ['merchant_payment', 'paybill_payment', 'airtime_purchase', 'cash_withdrawal', 'fuliza_fee']) {
      expect(canLinkDebt(line({ type }))).toBe(false);
    }
    expect(canLinkDebt(line({ status: 'skipped' }))).toBe(false);
  });

  // A director's companies are creditors and debtors like anyone else: money from one
  // company's bank into M-Pesa and on to another company's bank is two debt entries.
  it('money in from a bank can always be a debt', () => {
    expect(canLinkDebt(line({ type: 'bank_receipt', direction: 'in' }))).toBe(true);
  });

  it('a paybill or till payment can be one when it names a bank or somebody in Who owes who, and not otherwise', () => {
    const company = [{ id: 5, name: 'Sample Holdings Ltd', owedToUs: 0, owedByUs: 0 }];
    expect(canLinkDebt(line({ type: 'paybill_payment', description: 'Sample Kcb Bank (Acc 1)' }))).toBe(true);
    expect(canLinkDebt(line({ type: 'paybill_payment', description: 'Sample Electricity Company' }))).toBe(false);
    expect(canLinkDebt(line({ type: 'paybill_payment', description: 'Sample Holdings Ltd' }), company)).toBe(true);
    expect(canLinkDebt(line({ type: 'merchant_payment', description: 'Sample Holdings Ltd' }), company)).toBe(true);
    expect(canLinkDebt(line({ type: 'airtime_purchase', description: 'Sample Holdings Ltd' }), company)).toBe(false);
  });

  it('two companies through the director: borrowed from the first, lent to the second', () => {
    const inFromBank = line({ direction: 'in', type: 'bank_receipt', amount: 3000, description: 'Received from Sample Equity Bank' });
    const outToBank = line({ index: 1, direction: 'out', type: 'paybill_payment', amount: 2500, description: 'Sample Kcb Bank (Acc 1)' });
    const borrowed = buildPostings(inFromBank, { include: true, category: '', debt: { kind: 'borrowed', partyId: 1 } }, ctx);
    const lent = buildPostings(outToBank, { include: true, category: '', debt: { kind: 'lend', partyId: 2 } }, ctx);
    expect(borrowed?.main).toMatchObject({ isBorrowing: true, amount: 3000 });
    expect(lent?.main).toMatchObject({ isLending: true, settlesContributorId: 2, amount: 2500 });
    const parties = [{ id: 1, name: 'First Company', owedByUs: 0, owedToUs: 0 }, { id: 2, name: 'Second Company', owedByUs: 0, owedToUs: 0 }];
    const changes = balanceChanges([inFromBank, outToBank], { 0: { include: true, category: '', debt: { kind: 'borrowed', partyId: 1 } }, 1: { include: true, category: '', debt: { kind: 'lend', partyId: 2 } } }, parties, []);
    expect(changes.map((change) => change.body)).toEqual([{ owedByUs: 3000 }, { owedToUs: 2500 }]);
  });

  it('offers the two meanings each way money can move', () => {
    expect(debtKindsFor('out')).toEqual(['pay-back', 'lend']);
    expect(debtKindsFor('in')).toEqual(['repaid', 'borrowed']);
  });
});

describe('matching a payee to somebody in Who owes who', () => {
  it('matches the same name however it is written', () => {
    expect(matchParty('JEREMIAH  CHEGE', parties)?.id).toBe(1);
  });

  it("matches a shorter name whose every word is in the payee's", () => {
    expect(matchParty('LEWIS MICHENI', parties)?.id).toBe(2);
  });

  it('prefers the more specific of two matches, and gives none when they tie', () => {
    const both: PartyLite[] = [{ id: 1, name: 'Jeremiah' }, { id: 2, name: 'Jeremiah Chege' }];
    expect(matchParty('Jeremiah Chege Mwangi', both)?.id).toBe(2);
    expect(matchParty('Jeremiah Kamau', [{ id: 1, name: 'Jeremiah' }, { id: 4, name: 'Jeremiah' }])).toBeNull();
  });

  it('does not guess when nobody fits', () => {
    expect(matchParty('Sample Supermarket', parties)).toBeNull();
    expect(matchParty(null, parties)).toBeNull();
  });

  it('suggests what the balance already says, and nothing otherwise', () => {
    expect(suggestDebtKind('out', parties[0])).toBe('pay-back');
    expect(suggestDebtKind('in', parties[1])).toBe('repaid');
    expect(suggestDebtKind('out', parties[1])).toBeNull();
    expect(suggestDebtKind('in', parties[0])).toBeNull();
    expect(suggestDebtKind('out', parties[2])).toBeNull();
  });
});

describe('what is saved for each meaning', () => {
  it('paying back what you owe is an ordinary categorised payment', () => {
    const built = buildPostings(line({}), { include: true, category: 'Loans', debt: { kind: 'pay-back', partyId: 1 } }, ctx);
    expect(built?.main).toMatchObject({ expenseCategory: 'Loans', destinationKind: 'category', amount: 500 });
    expect(built?.main).not.toHaveProperty('isLending');
  });

  it('lending is not spending: no category, marked as lending, linked to the person', () => {
    const built = buildPostings(line({}), { include: true, category: '', debt: { kind: 'lend', partyId: 2 } }, ctx);
    expect(built?.kind).toBe('disbursement');
    expect(built?.main).toMatchObject({ isLending: true, settlesContributorId: 2, mpesaReceipt: 'TESTX1' });
    expect(built?.main).not.toHaveProperty('expenseCategory');
  });

  it('being paid back settles their debt, and borrowing is marked as a loan, neither as income', () => {
    const repaid = buildPostings(line({ direction: 'in', type: 'person_receipt' }), { include: true, category: '', debt: { kind: 'repaid', partyId: 2 } }, ctx);
    expect(repaid?.kind).toBe('deposit');
    expect(repaid?.main).toMatchObject({ settlesContributorId: 2 });
    const borrowed = buildPostings(line({ direction: 'in', type: 'person_receipt' }), { include: true, category: '', debt: { kind: 'borrowed', partyId: 1 } }, ctx);
    expect(borrowed?.main).toMatchObject({ isBorrowing: true });
    expect(borrowed?.main).not.toHaveProperty('settlesContributorId');
  });

  it('is unchanged when there is no debt link', () => {
    const built = buildPostings(line({}), { include: true, category: 'Fun' }, ctx);
    expect(built?.main).toMatchObject({ expenseCategory: 'Fun' });
    expect(built?.main).not.toHaveProperty('isLending');
    expect(built?.main).not.toHaveProperty('settlesContributorId');
  });

  it('the M-Pesa charge still posts on a loan', () => {
    const built = buildPostings(line({ fee: 33 }), { include: true, category: '', debt: { kind: 'lend', partyId: 2 } }, ctx);
    expect(built?.fee).toMatchObject({ amount: 33, expenseCategory: 'Bank charges' });
  });

  it('asks for a category on paying back, but not on lending', () => {
    const payBack: Choice = { include: true, category: '', debt: { kind: 'pay-back', partyId: 1 } };
    expect(problemWith(line({}), payBack)).toBe('Choose what it was for.');
    expect(problemWith(line({}), { include: true, category: '', debt: { kind: 'lend', partyId: 2 } })).toBeNull();
  });
});

describe('the balance changes offered afterwards', () => {
  const choices = (entries: Record<number, Choice>) => entries;

  it('lowers what you owe when you pay back, never below zero', () => {
    const changes = balanceChanges(
      [line({ index: 0, amount: 500 }), line({ index: 1, amount: 3000 })],
      choices({
        0: { include: true, category: 'Loans', debt: { kind: 'pay-back', partyId: 1 } },
        1: { include: true, category: 'Loans', debt: { kind: 'pay-back', partyId: 1 } },
      }),
      parties,
      [],
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ method: 'PATCH', endpoint: '/api/contributors/1', body: { owedByUs: 0 } });
    expect(changes[0].label).toBe('Jeremiah Chege: you owe 2,000 → 0');
  });

  it('adds to what they owe you when you lend, and lowers it when they pay back', () => {
    const changes = balanceChanges(
      [line({ index: 0, amount: 200 }), line({ index: 1, amount: 100, direction: 'in', type: 'person_receipt' })],
      choices({
        0: { include: true, category: '', debt: { kind: 'lend', partyId: 2 } },
        1: { include: true, category: '', debt: { kind: 'repaid', partyId: 2 } },
      }),
      parties,
      [],
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ body: { owedToUs: 400 } });
    expect(changes[0].label).toBe('Lewis: owes you 300 → 400');
  });

  it('adds to what you owe when you borrow', () => {
    const [change] = balanceChanges(
      [line({ direction: 'in', type: 'person_receipt', amount: 1000 })],
      choices({ 0: { include: true, category: '', debt: { kind: 'borrowed', partyId: 3 } } }),
      parties,
      [],
    );
    expect(change).toMatchObject({ body: { owedByUs: 1000 } });
  });

  it('pays down a debt category when a payment is filed under it', () => {
    const [change] = balanceChanges(
      [line({ type: 'paybill_payment', amount: 5000 })],
      choices({ 0: { include: true, category: 'Car loan' } }),
      parties,
      [{ id: 8, name: 'car loan', debtBalance: 120000 }],
    );
    expect(change).toMatchObject({ method: 'PUT', endpoint: '/api/budget-categories/8', body: { debtBalance: 115000 } });
  });

  it('offers nothing for lines that were not saved, or not linked, or a category with no debt', () => {
    expect(balanceChanges(
      [line({ index: 0 }), line({ index: 1 }), line({ index: 2, type: 'paybill_payment' })],
      choices({
        0: { include: false, category: 'Loans', debt: { kind: 'pay-back', partyId: 1 } },
        1: { include: true, category: 'Fun' },
        2: { include: true, category: 'Groceries' },
      }),
      parties,
      [{ id: 8, name: 'Car loan', debtBalance: 100 }],
    )).toEqual([]);
  });
});

describe('the debt logic is the same on both apps', () => {
  const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  it('shares the exact code, apart from how the two files name each other', () => {
    expect(read('../family-budget/src/lib/mpesa-debts.ts')).toBe(read('lib/mpesaDebts.ts').replace(/'/g, '"').replace('./mpesaImport', './mpesa-import'));
  });

  it.each([
    ['phone', read('app/mpesa-import.tsx')],
    ['web', read('../family-budget/src/pages/mpesa-import.tsx')],
  ])('%s offers the choice on a person line, and the balances only after saving, asked and not applied', (_name, source) => {
    expect(source).toContain('canLinkDebt(item, parties)');
    expect(source).toContain('matchParty(item.original ?? item.description, parties)');
    expect(source).toContain('balanceChanges(');
    expect(source).toContain('Is this a debt or loan?');
    expect(source).toContain('The entries are already saved either way.');
    expect(source).toContain("choice.debt?.kind !== 'lend'".replace(/'/g, source.includes('window.confirm') ? '"' : "'"));
  });

  it('applies a balance change only after being asked', () => {
    expect(read('app/mpesa-import.tsx')).toContain("text: 'Update'");
    expect(read('../family-budget/src/pages/mpesa-import.tsx')).toContain('if (!window.confirm(question)) return;');
  });
});
