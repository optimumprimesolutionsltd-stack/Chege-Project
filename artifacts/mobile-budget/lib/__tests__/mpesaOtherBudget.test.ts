import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// "would also want the work done still from the mpesa import" — a line can be sent straight
// to a different budget the person manages (a side hustle run as its own project), without
// switching away from the budget on screen.
describe('recording a line in a different budget, from the import (phone)', () => {
  const screen = read('app/mpesa-import.tsx');

  it('offers only budgets the person actually manages', () => {
    expect(screen).toContain("workspace.id !== group?.id && (workspace.role === 'owner' || workspace.role === 'admin')");
  });

  it('reads that budget without ever switching the one on screen to it', () => {
    expect(screen).toContain('fetchOtherBudgetOptions(');
    // The manual budget switcher is the only place that flips the active workspace.
    const otherBudgetBlock = screen.slice(screen.indexOf('otherManagedBudgets ='), screen.indexOf("otherBudget: async (groupId, direction, data) => {"));
    expect(otherBudgetBlock).not.toContain('selectWorkspace.mutateAsync');
    expect(otherBudgetBlock).not.toContain('AsyncStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY');
  });

  it('caches what it reads, so a second line for the same budget costs nothing further', () => {
    expect(screen).toContain('const cached = otherBudgetOptions[groupId];\n    if (cached) return cached;');
  });

  it('records it there by naming the budget explicitly, not by switching to it', () => {
    expect(screen).toContain("'x-jamvi-workspace': String(groupId)");
    expect(screen).toContain('createDepositInOtherBudget');
    expect(screen).toContain('createDisbursementInOtherBudget');
  });

  it('folds the choice away in the same "More" section as debt, move and savings', () => {
    const opensCollapsed = screen.indexOf("openMore.has(item.index) || destinationOf(choice) !== 'category'");
    const otherBudgetRow = screen.indexOf('mpesa-line-other-budget-${item.index}');
    const moreToggle = screen.indexOf('mpesa-line-more-${item.index}');
    expect(opensCollapsed).toBeGreaterThan(-1);
    expect(otherBudgetRow).toBeGreaterThan(opensCollapsed);
    expect(otherBudgetRow).toBeLessThan(moreToggle);
    expect(screen).toContain('another budget');
  });

  it('counts it apart from this budget\'s own income and spending', () => {
    expect(screen).toContain('summary.toOtherBudgets');
  });
});
