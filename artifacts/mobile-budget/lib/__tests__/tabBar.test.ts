import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// The five-tab bar (lib/tabPlan, 10 Oct 2026): nothing removed or renamed.
describe('the tab bar is built from the plan, in both layouts', () => {
  const layout = read('app/(tabs)/_layout.tsx');
  it('one bar for everybody: the Simple view switch is gone', () => {
    expect(layout).toContain('visibleTabs({ isShared, showBudget, showDebt, showReports })');
    expect(existsSync('hooks/useSimpleView.ts')).toBe(false);
  });
  it('Goals, Search and Debt are routes without a tab, so every link to them still works', () => {
    expect(layout).toContain("{has('goals') && (");
    expect(layout).toContain("options={has('goals')");
    expect(layout).toContain("!has('search')");
    expect(layout).toContain("options={has('debt')");
    // Bank and Settings were never tabs.
    expect(layout).toContain('<Tabs.Screen name="bank"     options={{ href: null }} />');
  });
});

describe('More reaches everything the bar leaves out, each with a one-line reason', () => {
  const more = read('app/(tabs)/more.tsx');
  it('lists Bank, Goals, Search, Who owes who, Debt and Settings', () => {
    for (const route of ['/(tabs)/bank', '/(tabs)/goals', '/(tabs)/search', '/parties', '/(tabs)/debt', '/(tabs)/settings', '/help', '/mpesa-import']) {
      expect(more).toContain(`'${route}'`);
    }
    expect(more).toContain('hint:');
    expect(more).not.toContain('Simple view');
  });
  it('a group\'s Budget is under More, since Contributions has its tab', () => {
    expect(more).toContain('show: isShared && showBudget,');
    expect(more).not.toContain("key: 'contributions'");
    expect(more).not.toContain("key: 'reports'");
  });
});

describe('Search is an icon in Activity and Budget', () => {
  it('in both headers, opening the Search screen', () => {
    expect(read('app/(tabs)/history.tsx')).toContain('<HeaderSearchButton color={colors.foreground} testID="activity-search" />');
    expect(read('app/(tabs)/budget.tsx')).toContain('<HeaderSearchButton color="#FBF7EC" testID="budget-search" />');
    expect(read('components/HeaderSearchButton.tsx')).toContain("router.push('/(tabs)/search' as never)");
  });
});
