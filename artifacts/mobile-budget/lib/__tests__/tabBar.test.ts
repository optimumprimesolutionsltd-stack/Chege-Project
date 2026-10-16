import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// Three tabs (lib/tabPlan, 15 Oct 2026): nothing removed, every route still works.
describe('the tab bar is Home, Money, Plan, in both layouts', () => {
  const layout = read('app/(tabs)/_layout.tsx');
  it('one bar for everybody: the Simple view switch is gone', () => {
    expect(layout).toContain('visibleTabs({ isShared, showBudget, showDebt, showReports })');
    expect(existsSync('hooks/useSimpleView.ts')).toBe(false);
  });
  it('Money and Plan are tabs; Activity, Bank, Goals, Search and Debt are routes without one', () => {
    expect(layout).toContain('<NativeTabs.Trigger name="money">');
    expect(layout).toContain('<NativeTabs.Trigger name="plan">');
    expect(layout).toContain('<Tabs.Screen name="history" options={{ href: null }} />');
    expect(layout).toContain("options={has('goals')");
    expect(layout).toContain("!has('search')");
    expect(layout).toContain("options={has('debt')");
    expect(layout).toContain('<Tabs.Screen name="bank"     options={{ href: null }} />');
  });
  it('Money switches Accounts and All activity; the Reports tab opens on Reports, with Contributions and Budget beside it', () => {
    expect(layout).toContain('<Label>Reports</Label>');
    expect(layout).toContain("title: 'Reports',");
    const money = read('app/(tabs)/money.tsx');
    expect(money).toContain("{view === 'activity' ? <HistoryScreen /> : <BankScreen />}");
    const plan = read('app/(tabs)/plan.tsx');
    expect(plan).toContain("...(isShared ? [{ key: 'contributions', label: 'Contributions' }] : []),");
    expect(plan).toContain("...(showReports ? [{ key: 'reports', label: 'Reports' }] : []),");
    // Reports first, so the tab opens on it.
    expect(plan.indexOf("key: 'reports'")).toBeLessThan(plan.indexOf("key: 'contributions'"));
    expect(plan.indexOf("key: 'reports'")).toBeLessThan(plan.indexOf("key: 'budget'"));
    // Shown in the header every one of those screens already has.
    expect(read('components/WorkspaceIdentityRow.tsx')).toContain('<TabSwitchSlot tone={tone} />');
  });
});

describe('your picture on Home opens everything the bar leaves out', () => {
  const more = read('app/(tabs)/more.tsx');
  it('lists Goals, Search, Who owes who, Debt and Settings, with a way back', () => {
    for (const route of ['/(tabs)/goals', '/(tabs)/search', '/parties', '/(tabs)/debt', '/(tabs)/settings', '/help', '/mpesa-import']) {
      expect(more).toContain(`'${route}'`);
    }
    expect(more).toContain('hint:');
    expect(more).toContain('testID="more-back"');
    expect(read('app/(tabs)/index.tsx')).toContain("router.push('/(tabs)/more')");
  });
  it('Bank and Budget are not repeated there - they are the Money and Plan tabs', () => {
    expect(more).toContain('// On the Money tab now (lib/tabPlan).');
    expect(more).toContain('// On the Reports tab now, beside Contributions (lib/tabPlan).');
  });
});

describe('Search is an icon in Activity and Budget', () => {
  it('in both headers, opening the Search screen', () => {
    expect(read('app/(tabs)/history.tsx')).toContain('<HeaderSearchButton color={colors.foreground} testID="activity-search" />');
    expect(read('app/(tabs)/budget.tsx')).toContain('<HeaderSearchButton color="#FBF7EC" testID="budget-search" />');
    expect(read('components/HeaderSearchButton.tsx')).toContain("router.push('/(tabs)/search' as never)");
  });
});
