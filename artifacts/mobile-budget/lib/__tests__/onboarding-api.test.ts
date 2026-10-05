import { beforeEach, describe, expect, it, vi } from 'vitest';

const { customFetch } = vi.hoisted(() => ({ customFetch: vi.fn() }));

vi.mock('@workspace/api-client-react', () => ({
  customFetch,
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));

import { applyMobileOnboardingToWorkspace, saveMobileOnboardingPreferences, saveMobileOnboardingProgress } from '../onboarding-api';
import type { MobileOnboardingDraft } from '../onboarding';

const draftFor = (usageMode: MobileOnboardingDraft['usageMode']): MobileOnboardingDraft => ({
  usageMode,
  persona: usageMode === 'shared' ? 'chama' : 'family',
  coupleStage: null,
  budgetDuration: 'month',
  customEndDate: '',
  selectedCategories: ['Food', 'Transport'],
  customCategories: [],
  categoryBudgets: {},
  // Both open into subcategories, so their amounts are set against those.
  subcategoryBudgets: { Food: { Groceries: '8000', 'Eating out': '4000' }, Transport: { Fuel: '5000' } },
  selectedIncomeStreams: ['Salary'],
  incomeAmounts: { Salary: '45000' },
});

describe('mobile onboarding API paths', () => {
  beforeEach(() => {
    customFetch.mockClear();
    customFetch.mockResolvedValue({});
  });

  it('persists a Shared setup and applies its budget plan to a shared workspace', async () => {
    const draft = draftFor('shared');
    await saveMobileOnboardingPreferences(draft);
    await applyMobileOnboardingToWorkspace({
      workspace: { id: 41, isPrivate: false, role: 'owner' } as never,
      draft,
      userId: 'user-41',
    });

    expect(customFetch).toHaveBeenCalledWith('/api/onboarding/preferences', expect.objectContaining({ method: 'PUT' }));
    expect(customFetch).toHaveBeenCalledWith('/api/budget-plans/onboarding', expect.objectContaining({ method: 'POST' }));
    expect(customFetch).toHaveBeenCalledWith('/api/income-sources', expect.objectContaining({ method: 'POST' }));

    const preferenceBody = JSON.parse(customFetch.mock.calls[0][1].body);
    const planBody = JSON.parse(customFetch.mock.calls[1][1].body);
    const incomeBody = JSON.parse(customFetch.mock.calls[2][1].body);
    expect(preferenceBody).toMatchObject({ usageMode: 'shared', categoryNames: ['Food', 'Transport'], completed: true });
    expect(planBody).toMatchObject({ purpose: 'chama', durationType: 'month' });
    expect(planBody.categories).toEqual([
      expect.objectContaining({ name: 'Food', plannedAmount: 12000, position: 0 }),
      expect.objectContaining({ name: 'Transport', plannedAmount: 5000, position: 1 }),
    ]);
    // Each category goes with every one of its subcategories, blank or not,
    // so Food arrives with somewhere to record groceries.
    expect(planBody.categories[0].subcategories).toEqual([
      { name: 'Groceries', plannedAmount: 8000 },
      { name: 'Market shopping', plannedAmount: 0 },
      { name: 'Eating out', plannedAmount: 4000 },
    ]);
    expect(incomeBody).toMatchObject({ userId: 'user-41', name: 'Salary', expectedMonthlyAmount: 45000 });
  });

  it('keeps Both preferences intact while applying the plan to a Personal workspace', async () => {
    const draft = draftFor('both');
    await saveMobileOnboardingPreferences(draft);
    await applyMobileOnboardingToWorkspace({
      workspace: { id: 42, isPrivate: true, role: 'owner' } as never,
      draft,
      userId: 'user-42',
    });

    const preferenceBody = JSON.parse(customFetch.mock.calls[0][1].body);
    const planBody = JSON.parse(customFetch.mock.calls[1][1].body);
    expect(preferenceBody.usageMode).toBe('both');
    expect(planBody.categories).toHaveLength(2);
    expect(planBody.categories[0].plannedAmount).toBe(12000);
  });

  it('marks a saved in-progress setup as incomplete until the final step', async () => {
    await saveMobileOnboardingProgress({ ...draftFor('personal'), lastStep: 4 });

    const preferenceBody = JSON.parse(customFetch.mock.calls[0][1].body);
    expect(preferenceBody).toMatchObject({
      usageMode: 'personal',
      categoryNames: ['Food', 'Transport'],
      completed: false,
    });
  });

  it('never sends a category amount of its own: a custom one is its added subcategories, or nothing', async () => {
    const draft: MobileOnboardingDraft = {
      ...draftFor('personal'),
      selectedCategories: ['Farm', 'Pets'],
      customCategories: ['Farm', 'Pets'],
      // A parent figure left in an old draft is ignored.
      categoryBudgets: { Farm: '9999', Pets: '700' },
      customSubcategories: { Farm: ['Seeds', 'Feeds'] },
      subcategoryBudgets: { Farm: { Seeds: '1200', Feeds: '800' } },
    };
    await applyMobileOnboardingToWorkspace({ workspace: { id: 7, isPrivate: true, role: 'owner' } as never, draft, userId: 'user-7' });
    const planCall = customFetch.mock.calls.find((call) => call[0] === '/api/budget-plans/onboarding');
    const planBody = JSON.parse(planCall![1].body);
    expect(planBody.categories).toEqual([
      expect.objectContaining({ name: 'Farm', plannedAmount: 2000, subcategories: [{ name: 'Seeds', plannedAmount: 1200 }, { name: 'Feeds', plannedAmount: 800 }] }),
      expect.objectContaining({ name: 'Pets', plannedAmount: 0, subcategories: [] }),
    ]);
  });
});
