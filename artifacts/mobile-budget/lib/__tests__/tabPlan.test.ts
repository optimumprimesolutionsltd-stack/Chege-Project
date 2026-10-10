import { describe, expect, it } from 'vitest';
import { visibleTabs, type TabFlags } from '@/lib/tabPlan';

// "Cut the bar to 5 tabs: Home · Activity · Budget · Reports · More" (10 Oct 2026).
const base: TabFlags = { isShared: false, showBudget: true, showDebt: true, showReports: true };

describe('the tab bar: five tabs for everybody', () => {
  it('a personal budget: Home, Activity, Budget, Reports, More', () => {
    expect(visibleTabs(base)).toEqual(['index', 'history', 'budget', 'reports', 'more']);
  });

  it('a shared group: Contributions in Budget\'s place', () => {
    expect(visibleTabs({ ...base, isShared: true })).toEqual(['index', 'history', 'contributions', 'reports', 'more']);
  });

  it('never Goals, Search or Debt - they are under More', () => {
    for (const flags of [base, { ...base, isShared: true }]) {
      const tabs = visibleTabs(flags);
      expect(tabs).not.toContain('goals');
      expect(tabs).not.toContain('search');
      expect(tabs).not.toContain('debt');
    }
  });

  it('follows the Settings switches for Budget and Reports, and never more than five', () => {
    expect(visibleTabs({ ...base, showBudget: false, showReports: false })).toEqual(['index', 'history', 'more']);
    for (const isShared of [false, true]) {
      expect(visibleTabs({ ...base, isShared }).length).toBeLessThanOrEqual(5);
    }
  });
});
