import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { visibleTabs } from '@/lib/tabPlan';

// From the Personal audit: on the phone a shared group had no Reports and no
// Search, while the web gave groups both.
describe('a shared group has Reports and Search on the phone', () => {
  it('gets the Reports tab, as a Personal budget does', () => {
    expect(readFileSync('hooks/useTabFlags.ts', 'utf8')).toContain('const showReports = true;');
    // Reports and Contributions are both in a group's Plan tab (app/(tabs)/plan.tsx).
    const shared = visibleTabs({ isShared: true, showBudget: true, showDebt: false, showReports: true });
    expect(shared).toContain('plan');
    const plan = readFileSync('app/(tabs)/plan.tsx', 'utf8');
    expect(plan).toContain("key: 'reports'");
    expect(plan).toContain("key: 'contributions'");
  });

  it('keeps the bar to the size a Personal budget has, with Search under More', () => {
    const shared = visibleTabs({ isShared: true, showBudget: true, showDebt: true, showReports: true });
    const personal = visibleTabs({ isShared: false, showBudget: true, showDebt: true, showReports: true });
    expect(shared).not.toContain('search');
    expect(shared.length).toBe(personal.length);
    const more = readFileSync('app/(tabs)/more.tsx', 'utf8');
    expect(more.slice(more.indexOf("key: 'search'"), more.indexOf("key: 'owes'"))).toContain('show: true,');
  });
});
