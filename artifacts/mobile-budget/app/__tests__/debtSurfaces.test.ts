import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const home = readFileSync('app/(tabs)/index.tsx', 'utf8');
const tabs = readFileSync('app/(tabs)/_layout.tsx', 'utf8');
const screen = readFileSync('app/(tabs)/debt.tsx', 'utf8');
const card = readFileSync('components/DebtSummaryCard.tsx', 'utf8');

// Debt was one card buried inside the Budget tab: right for somebody
// budgeting, invisible to somebody whose reason for using Jamvi is clearing a
// loan.
describe('debt has a home screen presence', () => {
  it('renders a debt card on Home', () => {
    expect(home).toContain('<DebtSummaryCard />');
    expect(home).toContain("import { DebtSummaryCard } from '@/components/DebtSummaryCard';");
  });

  it('shows nothing when no debt is tracked', () => {
    // An empty debt card on every household's home screen would be the
    // opposite of making debt significant.
    expect(card).toContain('if (isLoading || debts.length === 0) return null;');
  });

  it('leads with the end date, not the balance alone', () => {
    expect(card).toContain('Debt-free by');
    expect(card).toContain('formatMonthKey(view.debtFreeOn)');
  });

  it('opens the debt screen', () => {
    expect(card).toContain("router.push('/(tabs)/debt')");
  });
});

describe('debt has its own tab, but only once it exists', () => {
  it('registers the tab in both layouts', () => {
    expect(tabs).toContain('<NativeTabs.Trigger name="debt">');
    expect(tabs).toContain('name="debt"');
  });

  it('hides the tab for a budget that tracks no debt', () => {
    expect(tabs).toContain("const showDebt = debtCategories.some((row) => row.debtBalance !== null && row.debtBalance !== undefined);");
    expect(tabs).toContain('{showDebt && (');
    expect(tabs).toContain('options={showDebt');
  });

  it('remounts the navigator when the tab appears', () => {
    // A native tab bar does not reliably grow a trigger when the set changes,
    // so marking the first debt has to remount for the tab to show up.
    expect(tabs).toContain("${showDebt ? 'debt' : 'nodebt'}");
  });
});

describe('the debt screen', () => {
  it('leads with what is owed and when it ends', () => {
    expect(screen).toContain('STILL OWED');
    expect(screen).toContain('Debt-free by');
  });

  it('offers both payoff strategies in plain words', () => {
    expect(screen).toContain("(['snowball', 'avalanche'] as const)");
    expect(screen).toContain('testID={`debt-strategy-${option}`}');
    expect(screen).toContain('Smallest first');
    expect(screen).toContain('Costliest first');
  });

  it('says why a debt has no end date rather than showing a blank', () => {
    expect(screen).toContain('No end date — nothing is budgeted towards this yet.');
    expect(screen).toContain('The interest is larger than the monthly amount, so this never reduces.');
  });

  it('reuses the existing card for tagging and editing debts', () => {
    // Rather than growing a second way to do the same thing.
    expect(screen).toContain('<DebtPayoffCard canManage />');
  });

  it('tells someone with no debts how to start', () => {
    expect(screen).toContain('No debts tracked yet.');
  });
});
