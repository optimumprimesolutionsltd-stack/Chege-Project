import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chooseCategory, defaultCategoryFor, initialChoices, type PreviewLine } from '@/lib/mpesaImport';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const line = (over: Partial<PreviewLine>): PreviewLine => ({
  index: 0,
  status: 'ready',
  reason: null,
  receipt: 'TESTX1',
  direction: 'out',
  type: 'person_payment',
  amount: 100,
  description: 'Sample Shop',
  date: '2026-10-24',
  fee: null,
  mpesaBalance: null,
  alreadyRecorded: null,
  ...over,
});

const NAMES = ['Groceries', 'Airtime & Data', 'Cash', 'Bank charges'];

// "Have the power for automatic choosing and manual choosing too."
describe('automatic suggestions', () => {
  it('suggests a category that suits the kind of payment, only from categories that exist', () => {
    expect(defaultCategoryFor(line({ type: 'airtime_purchase' }), NAMES)).toBe('Airtime & Data');
    expect(defaultCategoryFor(line({ type: 'cash_withdrawal' }), NAMES)).toBe('Cash');
    expect(defaultCategoryFor(line({ type: 'airtime_purchase' }), ['Groceries'])).toBe('');
    expect(defaultCategoryFor(line({ type: 'merchant_payment' }), NAMES)).toBe('');
  });

  it("prefers where that payee was filed before, and marks any suggestion as Jamvi's", () => {
    const lines = [
      line({ index: 0, description: 'Kenya Power' }),
      line({ index: 1, type: 'airtime_purchase', description: 'Airtime — Safaricom' }),
      line({ index: 2, description: 'New Place' }),
      line({ index: 3, direction: 'in', description: 'Received from A' }),
    ];
    const choices = initialChoices(lines, [{ type: 'disbursement', description: 'Kenya Power', expenseCategory: 'Electricity' }], NAMES);
    expect(choices[0]).toMatchObject({ category: 'Electricity', auto: true });
    expect(choices[1]).toMatchObject({ category: 'Airtime & Data', auto: true });
    expect(choices[2]).toMatchObject({ category: '', auto: false });
    expect(choices[3]).toMatchObject({ category: '', auto: false });
  });
});

describe('choosing by hand', () => {
  const lines = [
    line({ index: 0, type: 'airtime_purchase', description: 'Airtime — Safaricom' }),
    line({ index: 1, type: 'airtime_purchase', description: 'airtime — safaricom' }),
    line({ index: 2, type: 'airtime_purchase', description: 'Airtime — Safaricom' }),
    line({ index: 3, description: 'Other Shop' }),
  ];

  it('overrides a suggestion, and the choice is the person\'s from then on', () => {
    const start = initialChoices(lines, [], NAMES);
    expect(start[0]).toMatchObject({ category: 'Airtime & Data', auto: true });
    const next = chooseCategory(lines, start, 0, 'Groceries');
    expect(next[0]).toEqual({ include: true, category: 'Groceries', auto: false });
  });

  it("gives the same payee's empty lines the same category, without touching a line already chosen or another payee", () => {
    const start = initialChoices(lines, [], []);
    start[2] = { include: true, category: 'Fun', auto: false };
    const next = chooseCategory(lines, start, 0, 'Data');
    expect(next[0]).toMatchObject({ category: 'Data', auto: false });
    expect(next[1]).toMatchObject({ category: 'Data', auto: true });
    expect(next[2]).toMatchObject({ category: 'Fun', auto: false });
    expect(next[3]).toMatchObject({ category: '' });
  });

  it('does not touch anything else when a category is cleared', () => {
    const start = initialChoices(lines, [], []);
    const next = chooseCategory(lines, start, 0, '');
    expect(next[1].category).toBe('');
  });
});

describe('the screens keep both powers', () => {
  const phone = read('app/mpesa-import.tsx');
  const web = read('../family-budget/src/pages/mpesa-import.tsx');

  it.each([['phone', phone], ['web', web]])('%s suggests, says so, and lets it be changed', (_name, source) => {
    expect(source).toContain('initialChoices(');
    expect(source).toContain('categories.map((row) => row.name)');
    expect(source).toContain('chooseLineCategory(');
    expect(source).toContain('mpesa-line-suggested-');
    expect(source).toContain('Suggested by Jamvi.');
  });

  it('the account starts on the M-Pesa one but can be changed', () => {
    expect(phone).toContain('/m-?pesa/i.test(account.name)');
    expect(phone).toContain('onSelect={(id) => {');
    expect(web).toContain('/m-?pesa/i.test(account.name)');
    expect(web).toContain('setSelectedAccountId(Number(event.target.value))');
  });
});
