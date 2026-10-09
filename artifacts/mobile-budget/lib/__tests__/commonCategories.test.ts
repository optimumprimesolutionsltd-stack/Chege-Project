import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  rows: [] as Array<{ id: number; name: string; parentId: number | null; priority?: number | null }>,
  links: [] as Array<{ key: string; categoryId: number; name: string }>,
  calls: [] as Array<{ method: string; url: string; body?: Record<string, unknown> }>,
  nextId: 100,
}));

vi.mock('@workspace/api-client-react', () => ({
  getBudgetCategories: vi.fn(async () => api.rows.map((row) => ({ ...row }))),
  customFetch: vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body) as Record<string, unknown> : undefined;
    api.calls.push({ method, url, body });
    if (url === '/api/standard-categories' && method === 'GET') return { links: api.links };
    if (url === '/api/budget-categories' && method === 'POST') {
      const row = { id: api.nextId++, name: String(body?.name), parentId: (body?.parentId as number | null) ?? null, priority: body?.priority as number };
      api.rows.push(row);
      return row;
    }
    return {};
  }),
}));

import { ensureCommonCategories, recognisedPlace } from '@/lib/commonCategories';
import { knownPayeeCategory, knownPayeeOf, setMakesStandardCategories, setStandardLinks } from '@/lib/knownPayees';
import { initialChoices, type PreviewLine } from '@/lib/mpesaImport';
import { standardTargetFor } from '@/lib/standardCategory';

const line = (over: Partial<PreviewLine>): PreviewLine => ({
  index: 0,
  status: 'ready',
  reason: null,
  receipt: 'TESTPAY1',
  direction: 'out',
  type: 'paybill_payment',
  amount: 1000,
  description: 'Sample',
  named: true,
  date: '2026-10-09',
  fee: null,
  mpesaBalance: 0,
  alreadyRecorded: null,
  ...over,
});

// "Does it recognize eateries/restaurants/food place..etc", "what about
// clinic/pharmacy/medical/hospital logic etc" (9 Oct 2026).
describe('payees Jamvi recognises', () => {
  it.each([
    ['MAMA OLIECH HOTEL', 'eating-out'],
    ['KILIMANI BUTCHERY & GRILL', 'eating-out'],
    ['WESTLANDS NYAMA CHOMA', 'eating-out'],
    ['CAFÉ DELI', 'eating-out'],
    ['BOLT FOOD', 'eating-out'],
    ['KAWANGWARE BUTCHERY', 'groceries'],
    ['NAIVAS WESTLANDS', 'groceries'],
    ['GITHURAI WHOLESALERS', 'groceries'],
    ['NAIROBI WEST HOSPITAL', 'hospital'],
    ['SMILE DENTAL CLINIC', 'hospital'],
    ['LANCET LABORATORIES', 'hospital'],
    ['AAR HEALTHCARE', 'medical-cover'],
    ['PORTAL PHARMACY', 'medicine'],
    ['BOLT', 'taxi'],
    ['TOTAL GAS REFILL', 'cooking-gas'],
    ['TOTALENERGIES THIKA RD', 'fuel'],
    ['CITY COUNTY PARKING', 'parking'],
    ['BARBER SHOP KILIMANI', 'salon'],
    ['TEXT BOOK CENTRE', 'books'],
    ['WANJIRU SHOP', 'shop'],
  ])('%s as %s', (payee, key) => {
    expect(knownPayeeOf(payee)?.key).toBe(key);
  });

  it('never a person', () => {
    expect(knownPayeeOf('Jane Wanjiku')).toBeNull();
  });

  it('makes a common category for each, under its heading, except where spending could be anything', () => {
    expect(standardTargetFor('MAMA OLIECH HOTEL')).toMatchObject({ key: 'eating-out', name: 'Eating out', parent: 'Food' });
    expect(standardTargetFor('WANJIRU SHOP')).toMatchObject({ key: 'shop', name: 'Groceries', parent: 'Food' });
    expect(standardTargetFor('AAR HEALTHCARE')).toMatchObject({ name: 'Medical cover', parent: 'Insurance' });
    expect(standardTargetFor('KRA')).toBeNull();
  });
});

describe('a common category the person renamed', () => {
  afterEach(() => setStandardLinks({}));

  it('still gets its payees', () => {
    setStandardLinks({ 'eating-out': 'Hotels & food' });
    expect(knownPayeeCategory('JAVA HOUSE', ['Rent', 'Hotels & food'])).toBe('Hotels & food');
  });

  it('is ignored once it is gone', () => {
    setStandardLinks({ 'eating-out': 'Hotels & food' });
    expect(knownPayeeCategory('JAVA HOUSE', ['Rent', 'Eating out'])).toBe('Eating out');
  });
});

describe('the import files a payee Jamvi knows', () => {
  beforeEach(() => setMakesStandardCategories(true));
  afterEach(() => setMakesStandardCategories(false));

  it('under its common category, made before saving, and counted as filed', () => {
    const choices = initialChoices([line({ description: 'KPLC PREPAID' })], [], ['Rent']);
    expect(choices[0]).toMatchObject({ category: 'Electricity', confirmed: true });
  });

  it('under the budget\'s own category when it has one that fits', () => {
    expect(initialChoices([line({ description: 'KPLC PREPAID' })], [], ['Power & tokens'])[0].category).toBe('Power & tokens');
  });

  it('but never a person, a bank, or a line that named nobody', () => {
    const lines = [
      line({ index: 0, type: 'person_payment', description: 'Jane Wanjiku Hotel' }),
      line({ index: 1, description: 'Equity Paybill Account' }),
      line({ index: 2, named: false, description: 'Sample Hotel' }),
    ];
    const choices = initialChoices(lines, [], ['Rent']);
    expect(choices[0].category).toBe('Not sure yet');
    expect(choices[1].category).toBe('Not sure yet');
    expect(choices[2].category).toBe('Not sure yet');
  });

  it('only names a category that exists where nothing makes one', () => {
    setMakesStandardCategories(false);
    expect(initialChoices([line({ description: 'KPLC PREPAID' })], [], ['Rent'])[0].category).toBe('Not sure yet');
  });
});

describe('making sure a common category exists', () => {
  beforeEach(() => {
    api.rows = [
      { id: 1, name: 'Food', parentId: null, priority: 1 },
      { id: 2, name: 'Groceries', parentId: 1, priority: 1 },
      { id: 9, name: 'Power', parentId: null, priority: 1 },
      { id: 20, name: 'Transport', parentId: null, priority: 2 },
    ];
    api.links = [{ key: 'electricity', categoryId: 9, name: 'Power' }];
    api.calls = [];
    api.nextId = 100;
  });

  it('uses the remembered one, adopts one of the same name, and makes the rest in place', async () => {
    const made = await ensureCommonCategories([
      standardTargetFor('KPLC PREPAID')!,
      standardTargetFor('NAIVAS')!,
      standardTargetFor('JAVA HOUSE')!,
      standardTargetFor('K-GAS DEPOT')!,
    ]);
    expect(Object.fromEntries(made)).toEqual({
      electricity: 'Power',
      groceries: 'Groceries',
      'eating-out': 'Eating out',
      'cooking-gas': 'Cooking gas',
    });
    const posted = api.calls.filter((call) => call.method === 'POST').map((call) => [call.body?.name, call.body?.parentId]);
    // Eating out under the Food heading; Utilities made first, then Cooking gas under it.
    expect(posted).toEqual([['Eating out', 1], ['Utilities', null], ['Cooking gas', 101]]);
    const remembered = api.calls.filter((call) => call.method === 'PUT').map((call) => call.body);
    expect(remembered).toEqual([
      { key: 'groceries', categoryId: 2 },
      { key: 'eating-out', categoryId: 100 },
      { key: 'cooking-gas', categoryId: 102 },
    ]);
  });

  it('leaves one out when a category has the heading\'s name but is not a heading', async () => {
    // "Transport" here has nothing under it: nesting Fuel under it would make it a heading.
    const made = await ensureCommonCategories([standardTargetFor('RUBIS ENERGY')!]);
    expect(made.size).toBe(0);
    expect(api.calls.some((call) => call.method === 'POST')).toBe(false);
  });
});

describe('an entry already saved as Not sure yet', () => {
  it('goes to the budget\'s own category, else its common one; never a person or a bank', () => {
    expect(recognisedPlace('KPLC PREPAID', ['Power & tokens'])).toEqual({ name: 'Power & tokens', target: null });
    expect(recognisedPlace('MAMA OLIECH HOTEL', ['Rent'])).toMatchObject({ name: 'Eating out', target: { key: 'eating-out' } });
    expect(recognisedPlace('Jane Wanjiku', ['Rent'])).toBeNull();
    expect(recognisedPlace('Equity Paybill Account', ['Rent'])).toBeNull();
  });
});

describe('where it is wired in', () => {
  const read = (file: string) => readFileSync(file, 'utf8');

  it('every screen knows the budget\'s common categories, Home sorts old entries once, and the import makes them before saving', () => {
    expect(read('app/_layout.tsx')).toContain('useStandardLinks(isAuthenticated && !!user?.id && !user?.needsDisplayName);');
    expect(read('app/(tabs)/index.tsx')).toContain('useSortRecognisedOnce(group?.id, canManageBudget);');
    const importScreen = read('app/mpesa-import.tsx');
    expect(importScreen).toContain('const made = await ensureCommonCategories([...needed.values()]);');
    expect(importScreen).toContain('setMakesStandardCategories(true)');
  });

  it('sorts old entries once per budget, only for somebody who may change it', () => {
    const hook = read('hooks/useCommonCategories.ts');
    expect(hook).toContain('`jamvi:recognised-sorted:v1:${groupId}`');
    expect(hook).toContain("if (!groupId || !canManage || running.current) return;");
    expect(hook).toContain("getImportProgress()?.stage === 'saving'");
  });
});
