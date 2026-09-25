import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { reversalChanges, type DebtEntryLink } from '@/lib/debtLinks';
import type { DebtCategoryLite, PartyLite } from '@/lib/mpesaDebts';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const parties: PartyLite[] = [
  { id: 1, name: 'Sample Lender', owedByUs: 3500, owedToUs: 0 },
  { id: 2, name: 'Sample Borrower', owedByUs: 0, owedToUs: 3000 },
];
const categories: DebtCategoryLite[] = [{ id: 7, name: 'Loans', debtBalance: 10000 }];

describe('putting a balance back when a debt entry is deleted', () => {
  it('undoes paying back what you owe: you owe them that much again', () => {
    const links: DebtEntryLink[] = [{ transactionId: 10, partyId: 1, kind: 'pay-back' }];
    const [change] = reversalChanges([{ id: 10, type: 'disbursement', amount: 500 }], links, parties, categories);
    expect(change).toMatchObject({ endpoint: '/api/contributors/1', method: 'PATCH', body: { owedByUs: 4000 } });
  });

  it('undoes borrowing: you owe them that much less', () => {
    const [change] = reversalChanges([{ id: 11, type: 'deposit', amount: 1000 }], [{ transactionId: 11, partyId: 1, kind: 'borrowed' }], parties, categories);
    expect(change.body).toEqual({ owedByUs: 2500 });
  });

  it('undoes lending: they owe you that much less', () => {
    const [change] = reversalChanges([{ id: 12, type: 'disbursement', amount: 800 }], [{ transactionId: 12, partyId: 2, kind: 'lend' }], parties, categories);
    expect(change.body).toEqual({ owedToUs: 2200 });
  });

  it('undoes being paid back: they owe you that much again', () => {
    const [change] = reversalChanges([{ id: 13, type: 'deposit', amount: 1000 }], [{ transactionId: 13, partyId: 2, kind: 'repaid' }], parties, categories);
    expect(change.body).toEqual({ owedToUs: 4000 });
  });

  it('adds several entries for one person into one change, and never goes below nothing', () => {
    const links: DebtEntryLink[] = [
      { transactionId: 1, partyId: 1, kind: 'borrowed' },
      { transactionId: 2, partyId: 1, kind: 'borrowed' },
    ];
    const changes = reversalChanges(
      [{ id: 1, type: 'deposit', amount: 2000 }, { id: 2, type: 'deposit', amount: 2000 }],
      links,
      parties,
      categories,
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].body).toEqual({ owedByUs: 0 });
  });

  it('puts a debt category back when an unlinked payment was filed under it', () => {
    const [change] = reversalChanges([{ id: 20, type: 'disbursement', amount: 1500, expenseCategory: ' loans ' }], [], parties, categories);
    expect(change).toMatchObject({ endpoint: '/api/budget-categories/7', method: 'PUT', body: { debtBalance: 11500 } });
  });

  it('says nothing for entries with no link and no debt category, or whose person is gone', () => {
    expect(reversalChanges([{ id: 30, type: 'disbursement', amount: 10, expenseCategory: 'Food' }], [], parties, categories)).toEqual([]);
    expect(reversalChanges([{ id: 31, type: 'deposit', amount: 10 }], [{ transactionId: 31, partyId: 99, kind: 'repaid' }], parties, categories)).toEqual([]);
  });
});

describe('who a debt entry was for is recorded and read back', () => {
  const screen = read('app/mpesa-import.tsx');
  const bank = read('app/(tabs)/bank.tsx');
  it('the import records it right after saving, without ever blocking the save', () => {
    expect(screen).toContain('debtLinks.push({ transactionId: created.id');
    expect(screen).toContain('void saveDebtLinks(debtLinks);');
    expect(read('lib/debtReversal.ts')).toContain('The entries are saved either way');
  });
  it('deleting reads the link first, then offers, and never applies by itself', () => {
    expect(bank).toContain('fetchDebtLinks([tx.id])');
    expect(bank).toContain('offerDebtReversal(');
    expect(read('lib/debtReversal.ts')).toContain("text: 'Leave as it is'");
  });
  it('is the same logic on the phone and the web', () => {
    const norm = (s: string) => s.replace(/['"]/g, '"').replace(/\.\/(mpesaDebts|mpesa-debts)/g, './d');
    expect(norm(read('../family-budget/src/lib/debt-links.ts'))).toBe(norm(read('lib/debtLinks.ts')));
  });
});
