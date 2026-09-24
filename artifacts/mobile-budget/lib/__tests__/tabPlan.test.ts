import { describe, expect, it } from 'vitest';
import { visibleTabs, type TabFlags } from '@/lib/tabPlan';

const base: TabFlags = { simple: false, isShared: false, showBudget: true, showDebt: true, showReports: true };

describe('the full tab bar (unchanged)', () => {
  it('a personal budget with everything on has seven tabs and no More', () => {
    expect(visibleTabs(base)).toEqual(['index', 'history', 'budget', 'goals', 'search', 'reports', 'debt']);
  });

  it('a shared group swaps Search for Contributions', () => {
    const tabs = visibleTabs({ ...base, isShared: true });
    expect(tabs).toContain('contributions');
    expect(tabs).not.toContain('search');
  });

  it('leaves out what the budget does not have', () => {
    expect(visibleTabs({ ...base, showBudget: false, showDebt: false, showReports: false })).toEqual([
      'index',
      'history',
      'goals',
      'search',
    ]);
  });

  it('never shows More', () => {
    expect(visibleTabs(base)).not.toContain('more');
  });
});

describe('simple view', () => {
  it('keeps four tabs and a More', () => {
    expect(visibleTabs({ ...base, simple: true })).toEqual(['index', 'history', 'budget', 'goals', 'more']);
  });

  it('is the same for a shared group: everything else is under More', () => {
    expect(visibleTabs({ ...base, simple: true, isShared: true })).toEqual([
      'index',
      'history',
      'budget',
      'goals',
      'more',
    ]);
  });

  it('drops Budget when the budget is off', () => {
    expect(visibleTabs({ ...base, simple: true, showBudget: false })).toEqual(['index', 'history', 'goals', 'more']);
  });

  it('never shows more than five tabs', () => {
    expect(visibleTabs({ ...base, simple: true }).length).toBeLessThanOrEqual(5);
  });
});
