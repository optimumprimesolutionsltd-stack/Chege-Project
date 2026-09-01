import { beforeEach, describe, expect, it, vi } from 'vitest';

const { customFetch } = vi.hoisted(() => ({ customFetch: vi.fn() }));

vi.mock('@workspace/api-client-react', () => ({
  customFetch,
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));

import { applyMobileOnboardingToWorkspace, saveMobileOnboardingPreferences } from '../onboarding-api';
import type { MobileOnboardingDraft } from '../onboarding';

const draftFor = (usageMode: MobileOnboardingDraft['usageMode']): MobileOnboardingDraft => ({
  usageMode,
  persona: usageMode === 'shared' ? 'chama' : 'family',
  budgetDuration: 'month',
  customEndDate: '',
  selectedCategories: ['Food', 'Transport'],
  customCategories: [],
  categoryBudgets: { Food: '12000', Transport: '5000' },
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
});
