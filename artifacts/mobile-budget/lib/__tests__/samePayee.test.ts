import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { moveSummary, samePayeeToMove } from '@/lib/samePayee';

// "Eagles African Dishes" under Boda boda and matatu, not Eat outs: "this
// problem is common. If the app sees this can it sort out the rest in different
// periods?" (8 Oct 2026)
describe("a corrected payment takes the payee's others with it", () => {
  const pay = (id: number, date: string, expenseCategory: string | null, extra: Record<string, unknown> = {}) =>
    ({ id, type: 'disbursement', amount: 500, date, description: 'Eagles African Dishes', expenseCategory, ...extra });
  const rows = [
    pay(1, '2026-07-29', 'Eat outs'),
    pay(2, '2026-03-02', 'Boda boda and matatu'),
    pay(3, '2026-09-10', 'boda boda and matatu'),
    pay(4, '2026-05-05', 'Not sure yet'),
    pay(5, '2026-06-06', 'Groceries'),
    pay(6, '2026-06-07', 'Boda boda and matatu', { chargeForTransactionId: 2 }),
    pay(7, '2026-06-08', 'Boda boda and matatu', { settlesContributorId: 3 }),
    { ...pay(8, '2026-06-09', 'Boda boda and matatu'), description: 'Uber' },
    { ...pay(9, '2026-06-10', 'Boda boda and matatu'), type: 'deposit' },
  ];

  it('in every month, still under the old category or Not sure yet - oldest first', () => {
    expect(samePayeeToMove(rows, { id: 1, description: 'Eagles African Dishes' }, 'Boda boda and matatu', 'Eat outs').map((row) => row.id)).toEqual([2, 4, 3]);
  });

  it('nothing when the category did not change, or went to Not sure yet', () => {
    expect(samePayeeToMove(rows, { id: 1, description: 'Eagles African Dishes' }, 'Eat outs', 'Eat outs')).toEqual([]);
    expect(samePayeeToMove(rows, { id: 1, description: 'Eagles African Dishes' }, 'Boda boda and matatu', 'Not sure yet')).toEqual([]);
  });

  it('says how many, how much and when', () => {
    expect(moveSummary([{ amount: 500, date: '2026-03-02' }, { amount: 700, date: '2026-09-10' }])).toBe('2 payments, KES 1,200, Mar 2026 – Sep 2026');
    expect(moveSummary([{ amount: 500, date: '2026-03-02' }])).toBe('1 payment, KES 500, Mar 2026');
  });

  it('Bank offers it after the save, and remembers the payee for the next import', () => {
    const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
    expect(bank).toContain('samePayeeToMove(data?.transactions ?? [], editingTransaction, from, expenseCategory)');
    expect(bank).toContain('offerSamePayee(samePayeeOffer);');
    expect(bank).toContain('withRule(latest, offer.description, offer.to)');
    expect(bank).toContain("{ text: 'Just this one', style: 'cancel', onPress: askRemember }");
  });
});

// "Changed for Peter Mbugua from bodaboda to kinyozi but was not asked ... if
// the app can remember this category for future. The remember this category
// should only be asked once, not every time" (8 Oct 2026).
describe('remembering a payee\'s category is asked once', () => {
  it('asks when nothing is remembered and it was never asked', async () => {
    const { rememberStep } = await import('@/lib/samePayee');
    expect(rememberStep('Peter Mbugua', 'Kinyozi', '', [])).toBe('ask');
  });

  it('never asks again about a payee already asked, whatever the answer was', async () => {
    const { rememberStep } = await import('@/lib/samePayee');
    expect(rememberStep('Peter Mbugua', 'Kinyozi', '', ['peter mbugua'])).toBe('none');
  });

  it('a remembered category follows a correction without asking', async () => {
    const { rememberStep } = await import('@/lib/samePayee');
    expect(rememberStep('Peter Mbugua', 'Kinyozi', 'Boda boda and matatu', [])).toBe('update');
    expect(rememberStep('Peter Mbugua', 'Kinyozi', 'kinyozi', [])).toBe('none');
  });

  it('only a real change counts', async () => {
    const { categoryChanged, parseRememberAsked } = await import('@/lib/samePayee');
    expect(categoryChanged('Boda boda and matatu', 'Kinyozi')).toBe(true);
    expect(categoryChanged('Kinyozi', 'kinyozi')).toBe(false);
    expect(categoryChanged('Kinyozi', 'Not sure yet')).toBe(false);
    expect(parseRememberAsked('["peter mbugua"]')).toEqual(['peter mbugua']);
    expect(parseRememberAsked('broken')).toEqual([]);
  });

  it('Bank asks after the save even when there are no others, and Move all remembers without asking', () => {
    const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
    expect(bank).toContain('if (categoryChanged(from, expenseCategory)) {');
    expect(bank).toContain("{ text: 'Just this one', style: 'cancel', onPress: askRemember }");
    expect(bank).toContain("{ text: 'Remember', onPress: () => void remember().then(noteAsked) }");
    expect(bank).toContain("{ text: 'No', style: 'cancel', onPress: () => void noteAsked() }");
  });
});

// "The app says it has moved them but I still find them all over" (8 Oct 2026).
describe('one payee, however M-Pesa wrote it', () => {
  it('capitals, numbers, masks, punctuation and Ltd are set aside', async () => {
    const { samePayeeName } = await import('@/lib/samePayee');
    expect(samePayeeName('EAGLES AFRICAN DISHES LTD')).toBe('eagles african dishes');
    expect(samePayeeName('Eagles African Dishes 0712***678')).toBe('eagles african dishes');
    expect(samePayeeName('Eagles-African Dishes (Till 123456)')).toBe('eagles african dishes');
    expect(samePayeeName('Peter Mbugua')).not.toBe(samePayeeName('Peter Mbugua Kamau'));
  });

  it('so the move finds them all', async () => {
    const { samePayeeToMove } = await import('@/lib/samePayee');
    const rows = [
      { id: 1, type: 'disbursement', amount: 500, date: '2026-07-29', description: 'Eagles African Dishes', expenseCategory: 'Eat outs' },
      { id: 2, type: 'disbursement', amount: 500, date: '2026-04-02', description: 'EAGLES AFRICAN DISHES LTD', expenseCategory: 'Boda boda and matatu' },
      { id: 3, type: 'disbursement', amount: 500, date: '2026-08-02', description: 'Eagles African Dishes 0712***678', expenseCategory: 'Boda boda and matatu' },
    ];
    expect(samePayeeToMove(rows, rows[0], 'Boda boda and matatu', 'Eat outs').map((row) => row.id)).toEqual([2, 3]);
  });

  it('each moved payment shows on the list at once, and Jamvi says how many moved', () => {
    const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
    expect(bank).toContain("Alert.alert('Moved', `${moved} ${moved === 1 ? 'payment' : 'payments'} to ${offer.description} moved to ${offer.to}.`);");
    expect(bank).toContain('const saved = await updateTransaction({ id: row.id, data: { amount: row.amount, date: row.date, expenseCategory: offer.to } as never });');
  });
});
