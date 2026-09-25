import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPostings, canReport, chooseCategory, defaultCategoryFor, initialChoices, type PostingContext, type PreviewLine } from '@/lib/mpesaImport';

const ctx: PostingContext = { accountId: 9, userId: 'u1', isShared: false, today: '2026-10-25', chargeCategory: 'Bank charges' };

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

describe('a Fuliza access fee is recorded as a bank charge', () => {
  const fee = (over: Partial<PreviewLine> = {}) =>
    line({ index: 0, type: 'fuliza_fee', description: 'Fuliza access fee', amount: 0.26, receipt: 'TESTFULIZA1FEE', named: true, ...over });

  it('starts in the category charges already go to, and can be changed like any other', () => {
    const start = initialChoices([fee()], [], NAMES, 'Bank charges');
    expect(start[0]).toMatchObject({ include: true, category: 'Bank charges', auto: true });
    expect(chooseCategory([fee()], start, 0, 'Household')[0]).toMatchObject({ category: 'Household', auto: false });
  });

  it('prefers where the last Fuliza fee went, then a category that says charge or fee', () => {
    const history = [{ type: 'disbursement', description: 'Fuliza access fee', expenseCategory: 'Fuliza costs' }];
    expect(initialChoices([fee()], history, NAMES, 'Bank charges')[0].category).toBe('Fuliza costs');
    expect(initialChoices([fee()], [], NAMES, '')[0].category).toBe('Bank charges');
    expect(initialChoices([fee()], [], ['Groceries'], '')[0].category).toBe('');
  });

  it('is saved as an ordinary spending posting with its own receipt code, and no fee of its own', () => {
    const built = buildPostings(fee(), { include: true, category: 'Bank charges' }, ctx);
    expect(built?.kind).toBe('disbursement');
    expect(built?.main).toMatchObject({
      amount: 0.26, description: 'Fuliza access fee', expenseCategory: 'Bank charges', mpesaReceipt: 'TESTFULIZA1FEE', date: '2026-10-24',
    });
    expect(built?.fee).toBeNull();
  });

  it('is not offered as a message to send, since Jamvi understood it', () => {
    expect(canReport(fee())).toBe(false);
  });
});

// "Still can't see categories": the picker only ever said "no category matches
// that", so nobody could tell loading from failed from genuinely empty.
describe('the category picker says what is wrong and can fix it', () => {
  const phone = read('app/mpesa-import.tsx');
  const web = read('../family-budget/src/pages/mpesa-import.tsx');

  it('loads the budget categories itself, the way the day of banking does, not through a prop', () => {
    const sheet = phone.slice(phone.indexOf('function CategorySheet'), phone.indexOf('export default function MpesaImportScreen'));
    expect(sheet).toContain('useGetBudgetCategories()');
    expect(sheet).not.toContain('categories: CategoryRow[];');
    expect(phone).toContain('<CategorySheet visible={picking !== null} budgetName={group?.name}');
  });

  it('tells loading, failed and empty apart, and names the budget that has none', () => {
    expect(phone).toContain("'Loading your categories…'");
    expect(phone).toContain("'Could not load your categories.'");
    expect(phone).toContain('has no categories yet. Add one below.');
    expect(phone).toContain("'No category matches that.'");
    expect(phone).toContain('testID="mpesa-category-retry"');
  });

  it('lets a category be added right there, and used at once', () => {
    expect(phone).toContain('useCreateBudgetCategory()');
    expect(phone).toContain('testID="mpesa-category-add"');
    expect(phone).toContain('Add and use it');
    expect(phone).toContain('await queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });');
  });

  it('suggests again when the categories or history arrive after the messages were read', () => {
    expect(phone).toContain('}, [categoryList, account]);');
    expect(phone).toContain('refreshSuggestions(lines, current, history, categories.map((row) => row.name), chargeCategory, rules)');
  });

  it('the web page says so when there are no categories, and points to Budget', () => {
    expect(web).toContain('data-testid="mpesa-no-categories"');
    expect(web).toContain('has no categories yet.');
    expect(web).toContain('Add categories in Budget');
    expect(web).toContain('categoriesLoading');
    expect(web).toContain('categoriesError');
  });
});
