import { describe, expect, it } from 'vitest';
import { visibleTabs, type TabFlags } from '@/lib/tabPlan';

// "The tab thing with banks reports etc is exhausting" (15 Oct 2026): three tabs.
const base: TabFlags = { isShared: false, showBudget: true, showDebt: true, showReports: true };

describe('the tab bar: Home, Money, Plan for everybody', () => {
  it('a personal budget and a shared group alike', () => {
    expect(visibleTabs(base)).toEqual(['index', 'money', 'plan']);
    expect(visibleTabs({ ...base, isShared: true })).toEqual(['index', 'money', 'plan']);
  });

  it('never the screens Money and Plan hold, or what is behind your picture', () => {
    for (const flags of [base, { ...base, isShared: true }, { ...base, showBudget: false, showReports: false }]) {
      const tabs = visibleTabs(flags);
      for (const name of ['history', 'budget', 'reports', 'contributions', 'goals', 'search', 'debt', 'more'] as const) {
        expect(tabs).not.toContain(name);
      }
    }
  });
});
