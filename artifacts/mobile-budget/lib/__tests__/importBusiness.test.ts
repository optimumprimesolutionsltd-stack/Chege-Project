import { describe, expect, it } from 'vitest';
import { businessOfLine, businessPayees, chooseBusiness, chooseNewCost, costOwners, costsOf } from '../importBusiness';
import type { Choice, PreviewLine } from '../mpesaImport';

const line = (over: Partial<PreviewLine>): PreviewLine => ({
  index: 0,
  status: 'ready',
  reason: null,
  receipt: 'TESTSEND1',
  direction: 'out',
  type: 'paybill',
  amount: 4400,
  description: 'Kcb Paybill Ac (5846630)',
  date: '2026-04-15',
  fee: null,
  mpesaBalance: 0,
  alreadyRecorded: null,
  ...over,
});

// Ujenzi (7) is a business with two costs; Salary (3) is only an income stream.
const businessIds = new Set([7]);
const owners = costOwners(
  [
    { name: 'Ujenzi - materials', reducesIncomeSourceId: 7 },
    { name: 'Ujenzi - labour', reducesIncomeSourceId: 7 },
    { name: 'Side gig costs', reducesIncomeSourceId: 3 },
    { name: 'Rent', reducesIncomeSourceId: null },
  ],
  businessIds,
);

describe('costOwners', () => {
  it('keeps only the costs of My businesses', () => {
    expect([...owners.entries()]).toEqual([['Ujenzi - materials', 7], ['Ujenzi - labour', 7]]);
    expect(costsOf(owners, 7)).toEqual(['Ujenzi - labour', 'Ujenzi - materials']);
    expect(costsOf(owners, null)).toEqual([]);
  });
});

describe('businessOfLine', () => {
  it('reads a payment as the business whose cost it is filed under', () => {
    expect(businessOfLine(line({}), { include: true, category: 'Ujenzi - labour' }, owners, businessIds)).toBe(7);
    expect(businessOfLine(line({}), { include: true, category: 'Rent' }, owners, businessIds)).toBeNull();
  });

  it('reads money in as the business it is filed to, never a plain income stream', () => {
    const inLine = line({ direction: 'in' });
    expect(businessOfLine(inLine, { include: true, category: '', incomeSourceId: 7 }, owners, businessIds)).toBe(7);
    expect(businessOfLine(inLine, { include: true, category: '', incomeSourceId: 3 }, owners, businessIds)).toBeNull();
  });

  it('holds a business chosen with no cost yet, until another category is picked', () => {
    expect(businessOfLine(line({}), { include: true, category: '', businessId: 7 }, owners, businessIds)).toBe(7);
    expect(businessOfLine(line({}), { include: true, category: 'Rent', businessId: 7 }, owners, businessIds)).toBeNull();
  });
});

describe('chooseBusiness', () => {
  const lines = [line({ index: 0 }), line({ index: 1, receipt: 'TESTSEND2' }), line({ index: 2, description: 'Someone Else' })];
  const notSure: Record<number, Choice> = {
    0: { include: true, category: 'Not sure yet', auto: true },
    1: { include: true, category: 'Not sure yet', auto: true },
    2: { include: true, category: 'Not sure yet', auto: true },
  };

  it('files a payment under the business\'s first cost, and the payee\'s other payments follow', () => {
    const next = chooseBusiness(lines, notSure, 0, 7, owners, businessIds);
    expect(next[0]).toMatchObject({ category: 'Ujenzi - labour', auto: false, businessId: 7, remember: true });
    expect(next[1]).toMatchObject({ category: 'Ujenzi - labour', auto: true });
    expect(businessOfLine(lines[1], next[1], owners, businessIds)).toBe(7);
    expect(next[2]).toEqual(notSure[2]);
  });

  it('keeps the cost already chosen when it is that business\'s', () => {
    const next = chooseBusiness(lines, { ...notSure, 0: { include: true, category: 'Ujenzi - materials' } }, 0, 7, owners, businessIds);
    expect(next[0].category).toBe('Ujenzi - materials');
  });

  it('waits for a cost when the business has none yet, then uses the one added', () => {
    const empty = new Map<string, number>();
    const next = chooseBusiness(lines, notSure, 0, 7, empty, businessIds);
    expect(next[0]).toMatchObject({ category: '', businessId: 7 });
    expect(businessOfLine(lines[0], next[0], empty, businessIds)).toBe(7);
    const added = chooseNewCost(lines, next, 0, 'Ujenzi - transport');
    expect(added[0]).toMatchObject({ category: 'Ujenzi - transport', businessId: 7 });
    expect(added[1]).toMatchObject({ category: 'Ujenzi - transport', auto: true });
  });

  it('Personal takes back a business\'s cost and asks for a category', () => {
    const next = chooseBusiness(lines, { ...notSure, 0: { include: true, category: 'Ujenzi - labour', remember: true } }, 0, null, owners, businessIds);
    expect(next[0]).toMatchObject({ category: '', businessId: null, remember: false });
    expect(businessOfLine(lines[0], next[0], owners, businessIds)).toBeNull();
  });

  it('Personal leaves a personal category alone', () => {
    const next = chooseBusiness(lines, { ...notSure, 0: { include: true, category: 'Rent' } }, 0, null, owners, businessIds);
    expect(next[0]).toMatchObject({ category: 'Rent', businessId: null });
  });

  it('money in for a business is its sales, and the payer\'s other money in follows', () => {
    const ins = [line({ index: 0, direction: 'in', description: 'Received from Jane Wanjiru' }), line({ index: 1, direction: 'in', description: 'Received from Jane Wanjiru' })];
    const start: Record<number, Choice> = { 0: { include: true, category: '' }, 1: { include: true, category: '' } };
    const next = chooseBusiness(ins, start, 0, 7, owners, businessIds);
    expect(next[0]).toMatchObject({ incomeSourceId: 7, sourceAuto: false, businessId: 7, remember: true });
    expect(next[1]).toMatchObject({ incomeSourceId: 7, sourceAuto: true });
    const back = chooseBusiness(ins, next, 0, null, owners, businessIds);
    expect(back[0]).toMatchObject({ incomeSourceId: null, businessId: null, confirmed: true });
  });
});

describe('businessPayees', () => {
  const lines = [
    line({ index: 0 }),
    line({ index: 1, receipt: 'TESTSEND2' }),
    line({ index: 2, direction: 'in', description: 'Received from Jane Wanjiru' }),
    line({ index: 3, description: 'Mama Mboga' }),
    line({ index: 4, description: 'Unsaved Supplier' }),
  ];
  const choices: Record<number, Choice> = {
    0: { include: true, category: 'Ujenzi - materials', remember: true, payeeName: ' Hardware supplier ' },
    1: { include: true, category: 'Ujenzi - materials', remember: true },
    2: { include: true, category: '', incomeSourceId: 7, remember: true },
    3: { include: true, category: 'Rent', remember: true },
    4: { include: true, category: 'Ujenzi - labour', remember: true },
  };

  it('lists each saved business payee once, with the name typed for it', () => {
    expect(businessPayees(lines, choices, new Set([0, 1, 2, 3]), owners, businessIds)).toEqual([
      { description: 'Kcb Paybill Ac (5846630)', direction: 'out', business: 7, category: 'Ujenzi - materials', name: 'Hardware supplier' },
      { description: 'Received from Jane Wanjiru', direction: 'in', business: 7, category: '' },
    ]);
  });

  it('leaves out what the person asked Jamvi not to learn', () => {
    const unticked = { ...choices, 0: { ...choices[0], remember: false }, 1: { ...choices[1], remember: false } };
    expect(businessPayees(lines, unticked, new Set([0, 1]), owners, businessIds)).toEqual([]);
  });
});
