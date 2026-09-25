import { describe, expect, it } from 'vitest';
import {
  buildPostings,
  initialChoices,
  isRecordable,
  lineLabel,
  problemWith,
  snippetFor,
  suggestCategory,
  summarise,
  type PostingContext,
  type PreviewLine,
} from '@/lib/mpesaImport';

const line = (over: Partial<PreviewLine>): PreviewLine => ({
  index: 0,
  status: 'ready',
  reason: null,
  receipt: 'TESTSEND1',
  direction: 'out',
  type: 'person_payment',
  amount: 70,
  description: 'Sample Person',
  date: '2026-09-02',
  fee: null,
  mpesaBalance: 0,
  alreadyRecorded: null,
  ...over,
});

const ctx: PostingContext = { accountId: 9, userId: 'u1', isShared: false, today: '2026-09-25', chargeCategory: 'Bank charges' };

describe('suggestCategory', () => {
  const history = [
    { type: 'disbursement', description: 'Kenya Power', expenseCategory: 'Electricity' },
    { type: 'disbursement', description: ' kenya  power ', expenseCategory: 'Electricity' },
    { type: 'disbursement', description: 'Kenya Power', expenseCategory: 'Household' },
    { type: 'deposit', description: 'Kenya Power', expenseCategory: 'Ignored' },
    { type: 'disbursement', description: 'Other', expenseCategory: 'Fun' },
  ];
  it('uses the category that payee was most often filed under, ignoring case and spacing', () => {
    expect(suggestCategory('KENYA POWER', history)).toBe('Electricity');
  });
  it('has no suggestion for a payee it has not seen', () => {
    expect(suggestCategory('New Shop', history)).toBe('');
    expect(suggestCategory('', history)).toBe('');
  });
});

describe('what starts ticked', () => {
  const lines = [
    line({ index: 0 }),
    line({ index: 1, direction: 'in', description: 'Received from Sample Person' }),
    line({ index: 2, status: 'skipped', reason: 'A reversal.', direction: null, amount: null }),
    line({ index: 3, alreadyRecorded: { date: '2026-09-02', description: 'Sample Person' } }),
  ];
  it('ticks what can be recorded, and nothing skipped or already recorded', () => {
    const choices = initialChoices(lines, []);
    expect(lines.map((l) => isRecordable(l))).toEqual([true, true, false, false]);
    expect(Object.values(choices).map((c) => c.include)).toEqual([true, true, false, false]);
  });
  it('pre-fills the category for a payee seen before', () => {
    const choices = initialChoices([line({ description: 'Kenya Power' })], [
      { type: 'disbursement', description: 'Kenya Power', expenseCategory: 'Electricity' },
    ]);
    expect(choices[0].category).toBe('Electricity');
  });
});

describe('problemWith', () => {
  it('asks for a category on money out only, and only while ticked', () => {
    expect(problemWith(line({}), { include: true, category: '' })).toBe('Choose what it was for.');
    expect(problemWith(line({}), { include: true, category: 'Transport' })).toBeNull();
    expect(problemWith(line({}), { include: false, category: '' })).toBeNull();
    expect(problemWith(line({ direction: 'in' }), { include: true, category: '' })).toBeNull();
  });
});

describe('summarise', () => {
  it('adds up what is ticked, with the fees counted apart', () => {
    const lines = [
      line({ index: 0, amount: 3000, fee: 25 }),
      line({ index: 1, direction: 'in', amount: 3500 }),
      line({ index: 2, amount: 800, fee: 29 }),
    ];
    const summary = summarise(lines, {
      0: { include: true, category: 'Rent' },
      1: { include: true, category: '' },
      2: { include: false, category: '' },
    });
    expect(summary).toEqual({ count: 2, moneyIn: 3500, moneyOut: 3000, fees: 25, missingCategory: 0 });
  });
});

describe('buildPostings', () => {
  it('sends money in as a deposit that carries its receipt', () => {
    const built = buildPostings(line({ direction: 'in', amount: 3500, receipt: 'TESTRECEIVE2' }), { include: true, category: '' }, ctx);
    expect(built?.kind).toBe('deposit');
    expect(built?.main).toMatchObject({ amount: 3500, mpesaReceipt: 'TESTRECEIVE2', accountId: 9, madeById: 'u1', date: '2026-09-02' });
    expect(built?.fee).toBeNull();
  });

  it('sends money out as a categorised disbursement with its receipt, and the fee as its own posting', () => {
    const built = buildPostings(line({ amount: 3000, fee: 25, receipt: 'TESTPAYBILL1' }), { include: true, category: 'Rent' }, ctx);
    expect(built?.kind).toBe('disbursement');
    expect(built?.main).toMatchObject({ amount: 3000, expenseCategory: 'Rent', mpesaReceipt: 'TESTPAYBILL1', destinationKind: 'category' });
    expect(built?.fee).toMatchObject({ amount: 25, expenseCategory: 'Bank charges', description: 'Bank charge — Sample Person' });
    // The fee is not a receipt of its own: only the payment can be a repeat.
    expect(built?.fee).not.toHaveProperty('mpesaReceipt');
  });

  it('files spending in a shared group under the group, and in a personal budget under the person', () => {
    const shared = buildPostings(line({}), { include: true, category: 'Fun' }, { ...ctx, isShared: true });
    expect(shared?.main).toMatchObject({ madeById: null });
    expect(buildPostings(line({}), { include: true, category: 'Fun' }, ctx)?.main).toMatchObject({ madeById: 'u1' });
  });

  it('uses today when the message carried no date, and leaves out a fee with nowhere to go', () => {
    const built = buildPostings(line({ date: null, fee: 25 }), { include: true, category: 'Fun' }, { ...ctx, chargeCategory: '' });
    expect(built?.main.date).toBe('2026-09-25');
    expect(built?.fee).toBeNull();
  });

  it('builds nothing for a line with no amount or direction', () => {
    expect(buildPostings(line({ amount: null }), { include: true, category: '' }, ctx)).toBeNull();
    expect(buildPostings(line({ direction: null }), { include: true, category: '' }, ctx)).toBeNull();
  });
});

describe('finding a line in a long list', () => {
  it('labels a line with who, how much and when', () => {
    expect(lineLabel(line({ description: 'M-Pesa payment', amount: 1250, date: '2026-09-23' }))).toBe('M-Pesa payment (KES 1,250, 2026-09-23)');
    expect(lineLabel(line({ description: null, amount: null, date: null }))).toBe('A payment');
  });

  it('shows the start of the message a line came from, from the pasted text', () => {
    const pasted = 'TESTA1 Confirmed. Ksh10.00 sent to X. TESTNONAME1 Confirmed. Ksh50.00 paid on 2/9/26 at 9:50 AM.   New M-PESA balance is Ksh0.00.';
    const snippet = snippetFor(pasted, 'TESTNONAME1');
    expect(snippet?.startsWith('TESTNONAME1 Confirmed. Ksh50.00 paid on 2/9/26')).toBe(true);
    expect(snippet).not.toContain('  ');
    expect(snippet!.length).toBeLessThanOrEqual(90);
  });

  it('shows nothing when the receipt is not in the pasted text', () => {
    expect(snippetFor('nothing here', 'TESTNONAME1')).toBeNull();
    expect(snippetFor('anything', null)).toBeNull();
  });
});
