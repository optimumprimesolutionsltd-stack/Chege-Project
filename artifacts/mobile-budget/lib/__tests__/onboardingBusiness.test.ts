import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { customFetch } = vi.hoisted(() => ({ customFetch: vi.fn() }));

vi.mock('@workspace/api-client-react', () => ({
  customFetch,
  ApiError: class ApiError extends Error {
    constructor(public status: number) {
      super(`status ${status}`);
    }
  },
}));

import { ApiError } from '@workspace/api-client-react';
// The mock's constructor, not the real one's three arguments.
const conflict = () => new (ApiError as unknown as new (status: number) => Error)(409);
import { applyMobileOnboardingToWorkspace, setUpBusiness } from '../onboarding-api';
import {
  businessNameFromDraft,
  businessNamesFromDraft,
  normalizeOnboardingDraft,
  recommendedCategoriesForPurpose,
  type MobileOnboardingDraft,
} from '../onboarding';

const draft = (overrides: Partial<MobileOnboardingDraft> = {}): MobileOnboardingDraft => ({
  usageMode: 'personal',
  persona: 'working',
  coupleStage: null,
  budgetDuration: 'month',
  customEndDate: '',
  selectedCategories: ['Food', 'Stock & inventory', 'Business supplies'],
  customCategories: [],
  categoryBudgets: {},
  selectedIncomeStreams: ['Salary or wages'],
  incomeAmounts: { "Wanjiru's Duka": '30000' },
  runsBusiness: true,
  businessName: "  Wanjiru's   Duka ",
  ...overrides,
});

const categories = [
  { id: 7, name: 'Food', reducesIncomeSourceId: null },
  { id: 8, name: 'Stock & inventory', reducesIncomeSourceId: null },
  { id: 9, name: 'Business supplies', reducesIncomeSourceId: null },
];

function respond(routes: Record<string, unknown>) {
  customFetch.mockImplementation(async (url: string, init: { method?: string }) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    const value = routes[key] ?? routes[url];
    if (value instanceof Error) throw value;
    return value ?? {};
  });
}

const callsTo = (method: string, prefix: string) =>
  customFetch.mock.calls.filter(([url, init]) => (init?.method ?? 'GET') === method && String(url).startsWith(prefix));

describe('the business question in onboarding', () => {
  beforeEach(() => customFetch.mockReset());

  it('names the business from what was typed, and only when there is one', () => {
    expect(businessNameFromDraft(draft())).toBe("Wanjiru's Duka");
    expect(businessNameFromDraft(draft({ businessName: '   ' }))).toBe('My business');
    expect(businessNameFromDraft(draft({ runsBusiness: false }))).toBeNull();
    expect(businessNameFromDraft(draft({ runsBusiness: null }))).toBeNull();
    // A group is never a person's business.
    expect(businessNameFromDraft(draft({ usageMode: 'shared' }))).toBeNull();
  });

  it('offers business costs to anybody who runs a business, whatever else they are', () => {
    expect(recommendedCategoriesForPurpose('student')).not.toContain('Stock & inventory');
    expect(recommendedCategoriesForPurpose('student', null, true)).toEqual(
      expect.arrayContaining(['Stock & inventory', 'Business supplies', 'Work & business']),
    );
  });

  it('keeps the answer across a resumed draft, and older drafts read as not asked', () => {
    const restored = normalizeOnboardingDraft(JSON.parse(JSON.stringify(draft())));
    expect(restored).toMatchObject({ runsBusiness: true, businessName: "  Wanjiru's   Duka " });
    const { runsBusiness: _r, businessName: _b, ...older } = draft();
    expect(normalizeOnboardingDraft(older)).toMatchObject({ runsBusiness: null, businessName: '' });
  });

  it('creates the business and links its costs to it, stock as cost of goods sold', async () => {
    respond({
      'POST /api/income-sources': { id: 55 },
      'GET /api/budget-categories': categories,
    });
    await setUpBusiness({ draft: draft(), userId: 'u1' });

    const created = callsTo('POST', '/api/income-sources').map(([, init]) => JSON.parse(init.body));
    expect(created).toEqual([expect.objectContaining({ userId: 'u1', name: "Wanjiru's Duka", expectedMonthlyAmount: 30000 })]);
    // Named in My businesses, so its costs are business costs and the salary question is asked.
    expect(callsTo('PUT', '/api/businesses/').map(([url, init]) => [url, JSON.parse(init.body)])).toEqual([['/api/businesses/55', { business: true }]]);

    const links = callsTo('PUT', '/api/budget-categories/').map(([url, init]) => [url, JSON.parse(init.body)]);
    expect(links).toEqual([
      ['/api/budget-categories/8', { reducesIncomeSourceId: 55, costKind: 'cogs' }],
      ['/api/budget-categories/9', { reducesIncomeSourceId: 55, costKind: 'expense' }],
    ]);
  });

  it('reuses a business that already exists, and leaves a category already linked alone', async () => {
    respond({
      'POST /api/income-sources': conflict(),
      'GET /api/income-sources?userId=u1': [{ id: 3, name: 'Salary or wages' }, { id: 12, name: "wanjiru's duka" }],
      'GET /api/budget-categories': [categories[0], { ...categories[1], reducesIncomeSourceId: 99 }, categories[2]],
    });
    await setUpBusiness({ draft: draft(), userId: 'u1' });

    const links = callsTo('PUT', '/api/budget-categories/').map(([url, init]) => [url, JSON.parse(init.body)]);
    expect(links).toEqual([['/api/budget-categories/9', { reducesIncomeSourceId: 12, costKind: 'expense' }]]);
  });

  it('takes more than one business, dropping blanks and repeats', () => {
    const several = draft({ moreBusinessNames: ['  Kamau  Boda ', '', "WANJIRU'S DUKA", 'Salon'] });
    expect(businessNamesFromDraft(several)).toEqual(["Wanjiru's Duka", 'Kamau Boda', 'Salon']);
    expect(businessNamesFromDraft(draft())).toEqual(["Wanjiru's Duka"]);
    expect(businessNamesFromDraft(draft({ runsBusiness: false, moreBusinessNames: ['Salon'] }))).toEqual([]);
    expect(businessNamesFromDraft(draft({ moreBusinessNames: ['A', 'B', 'C', 'D', 'E', 'F'] }))).toHaveLength(5);
    // Kept across a resumed draft; older drafts have none.
    expect(normalizeOnboardingDraft(JSON.parse(JSON.stringify(several)))?.moreBusinessNames).toEqual(['  Kamau  Boda ', '', "WANJIRU'S DUKA", 'Salon']);
    expect(normalizeOnboardingDraft(draft())?.moreBusinessNames).toEqual([]);
  });

  it('sets up every business, with the starter costs on the first one only', async () => {
    let next = 55;
    customFetch.mockImplementation(async (url: string, init: { method?: string }) => {
      const key = `${init?.method ?? 'GET'} ${url}`;
      if (key === 'POST /api/income-sources') return { id: next++ };
      if (key === 'GET /api/budget-categories') return categories;
      return {};
    });
    await setUpBusiness({ draft: draft({ moreBusinessNames: ['Kamau Boda'], incomeAmounts: { "Wanjiru's Duka": '30000', 'Kamau Boda': '12000' } }), userId: 'u1' });

    const created = callsTo('POST', '/api/income-sources').map(([, init]) => JSON.parse(init.body));
    expect(created).toEqual([
      expect.objectContaining({ name: "Wanjiru's Duka", expectedMonthlyAmount: 30000 }),
      expect.objectContaining({ name: 'Kamau Boda', expectedMonthlyAmount: 12000 }),
    ]);
    expect(callsTo('PUT', '/api/businesses/').map(([url]) => url)).toEqual(['/api/businesses/55', '/api/businesses/56']);
    const links = callsTo('PUT', '/api/budget-categories/').map(([, init]) => JSON.parse(init.body).reducesIncomeSourceId);
    expect(links).toEqual([55, 55]);
  });

  it('never gives the starter costs to a second business when the first could not be found', async () => {
    respond({
      'POST /api/income-sources': conflict(),
      'GET /api/income-sources?userId=u1': [{ id: 20, name: 'Kamau Boda' }],
      'GET /api/budget-categories': categories,
    });
    await setUpBusiness({ draft: draft({ moreBusinessNames: ['Kamau Boda'] }), userId: 'u1' });
    expect(callsTo('PUT', '/api/businesses/').map(([url]) => url)).toEqual(['/api/businesses/20']);
    expect(callsTo('PUT', '/api/budget-categories/')).toHaveLength(0);
    // The list of existing streams is read once, not once per business.
    expect(callsTo('GET', '/api/income-sources')).toHaveLength(1);
  });

  it('does nothing for somebody without a business', async () => {
    respond({});
    await setUpBusiness({ draft: draft({ runsBusiness: false }), userId: 'u1' });
    expect(customFetch).not.toHaveBeenCalled();
  });

  it('sets the business up on a Personal budget, never in a group, and never fails setup over it', async () => {
    respond({
      'POST /api/income-sources': { id: 55 },
      'GET /api/budget-categories': new Error('offline'),
    });
    await expect(applyMobileOnboardingToWorkspace({
      workspace: { id: 1, isPrivate: true, role: 'owner' } as never,
      draft: draft(),
      userId: 'u1',
    })).resolves.toBeUndefined();
    expect(callsTo('GET', '/api/budget-categories')).toHaveLength(1);

    customFetch.mockClear();
    await applyMobileOnboardingToWorkspace({
      workspace: { id: 2, isPrivate: false, role: 'owner' } as never,
      draft: draft(),
      userId: 'u1',
    });
    expect(callsTo('GET', '/api/budget-categories')).toHaveLength(0);
  });

  it('asks the question on the onboarding screen', () => {
    const screen = readFileSync(join(__dirname, '../../app/budget-chooser.tsx'), 'utf8');
    expect(screen).toContain('Do you run a business or side hustle?');
    expect(screen).toContain('testID="onboarding-business-name"');
    expect(screen).toContain('testID="onboarding-add-business"');
    expect(screen).toContain("Tell Jamvi whether you run a business to continue.");
    // The Personal budget is covered by the subscription; it is not free.
    expect(screen).not.toMatch(/free, private/i);
  });
});
