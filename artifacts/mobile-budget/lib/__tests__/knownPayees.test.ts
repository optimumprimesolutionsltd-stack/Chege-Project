import { describe, expect, it } from 'vitest';
import { knownPayeeCategory } from '@/lib/knownPayees';
import { initialChoices, type PreviewLine } from '@/lib/mpesaImport';

const line = (over: Partial<PreviewLine>): PreviewLine => ({
  index: 0,
  status: 'ready',
  reason: null,
  receipt: 'TESTPAY1',
  direction: 'out',
  type: 'paybill_payment',
  amount: 1000,
  description: 'Sample Person',
  named: true,
  date: '2026-10-05',
  fee: null,
  mpesaBalance: 0,
  alreadyRecorded: null,
  ...over,
});

// A budget made from the household pack: headings and the categories under them.
const household = [
  'Utilities', 'Electricity', 'Water', 'Wi-Fi',
  'Food', 'Groceries', 'Supermarket', 'Eating out',
  'Transport', 'Fuel', 'Matatu & bus',
  'Health', 'Medicine', 'Hospital & clinic', 'SHA contributions',
  'Shared bills', 'Business supplies', 'Not sure yet',
];

describe('knownPayeeCategory', () => {
  it.each([
    ['Kplc Prepaid (54401234567)', 'Electricity'],
    ['KENYA POWER', 'Electricity'],
    ['Nairobi City Water And Sewerage Company', 'Water'],
    ['Naivas Supermarket Kilimani', 'Supermarket'],
    ['Majid Al Futtaim Hypermarkets', 'Supermarket'],
    ['Quickmart Ruaka', 'Supermarket'],
    ['Rubis Energy Kenya', 'Fuel'],
    ['Totalenergies Marketing Kenya', 'Fuel'],
    ['Zuku (A123)', 'Wi-Fi'],
    ['Goodlife Pharmacy', 'Medicine'],
    ['Aga Khan University Hospital', 'Hospital & clinic'],
    ['Social Health Authority', 'SHA contributions'],
    ['Java House Junction', 'Eating out'],
    ['Easy Coach', 'Matatu & bus'],
  ])('files %s under %s', (payee, category) => {
    expect(knownPayeeCategory(payee, household)).toBe(category);
  });

  it('never suggests a heading', () => {
    // Uber fits no category this budget has; "Transport" is a heading and is not offered.
    expect(knownPayeeCategory('Uber Kenya', household)).toBe('');
  });

  it('only names a category the budget already has', () => {
    expect(knownPayeeCategory('Kplc Prepaid', ['Groceries'])).toBe('');
    expect(knownPayeeCategory('Kplc Prepaid', [])).toBe('');
  });

  it('matches a budget that names its own category differently', () => {
    expect(knownPayeeCategory('Kplc Prepaid', ['Rent', 'Power & tokens'])).toBe('Power & tokens');
    expect(knownPayeeCategory('Carrefour', ['Rent', 'Grocery shopping'])).toBe('Grocery shopping');
  });

  it('does not mistake look-alike words', () => {
    // "sha" is inside "Shared bills", "bus" inside "Business supplies".
    expect(knownPayeeCategory('Social Health Authority', ['Shared bills'])).toBe('');
    expect(knownPayeeCategory('Easy Coach', ['Business supplies'])).toBe('');
    expect(knownPayeeCategory('Jane Wanjiku', household)).toBe('');
  });
});

describe('a well-known payee in the import', () => {
  it('is suggested, waiting to be confirmed', () => {
    const choices = initialChoices([line({ description: 'Kplc Prepaid (54401234567)' })], [], household);
    expect(choices[0].category).toBe('Electricity');
    expect(choices[0].auto).toBe(true);
    expect(choices[0].confirmed).toBeUndefined();
  });

  it("gives way to the person's own history", () => {
    const choices = initialChoices(
      [line({ description: 'Naivas Supermarket Kilimani' })],
      [{ type: 'disbursement', description: 'Naivas Supermarket Kilimani', expenseCategory: 'Eating out' }],
      household,
    );
    expect(choices[0].category).toBe('Eating out');
  });

  it('leaves an unknown payee on Not sure yet', () => {
    const choices = initialChoices([line({ description: 'Jane Wanjiku' })], [], household);
    expect(choices[0].category).toBe('Not sure yet');
  });

  it('is never used for money in', () => {
    const choices = initialChoices([line({ direction: 'in', type: 'person_receipt', description: 'Naivas Supermarket' })], [], household);
    expect(choices[0].category).toBe('');
  });
});
