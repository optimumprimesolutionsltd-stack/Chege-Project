import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const budget = readFileSync('app/(tabs)/budget.tsx', 'utf8');
const route = readFileSync('../api-server/src/routes/dashboard.ts', 'utf8');

// The breakdown arrives flat and keyed by name, so Groceries sat beside Food
// as though the two were unrelated — the Budget tab was the last place that
// still knew nothing about subcategories.
describe('the Budget tab groups a parent with its children', () => {
  it('orders parents first, each followed by its own children', () => {
    expect(budget).toContain('const orderedBreakdown = useMemo(');
    expect(budget).toContain('for (const child of mine) ordered.push({ row: child, isChild: true, hasSubcategories: false });');
    expect(budget).toContain('{orderedBreakdown.map(({ row: cat, isChild, hasSubcategories }) => {');
  });

  it('never drops a child whose parent is not in this month', () => {
    // Without this it would be skipped as "handled by its parent" and then
    // never listed, because the parent is not there to list it.
    expect(budget).toContain("if (row.parentName && breakdown.some((candidate) => candidate.category === row.parentName)) continue;");
  });

  it('indents a subcategory rather than drawing it as a sibling', () => {
    expect(budget).toContain('isChild && styles.catCardChild');
    expect(budget).toContain('catCardChild: { marginLeft: 16, borderLeftWidth: 3');
  });
});

// A parent used to hold a budget of its own and show a second, rolled-up line
// beside it. Giving Food 20,000 and Groceries 8,000 under it asked the same
// question twice and counted the answer twice.
describe('a parent is budgeted through its subcategories', () => {
  it('takes the figures from the server rather than adding the children again', () => {
    expect(budget).toContain('ordered.push({ row, isChild: Boolean(row.parentName), hasSubcategories: mine.length > 0 });');
    // The old client-side rollup is gone; re-introducing it would double count.
    expect(budget).not.toContain('mine.reduce((sum, child) => sum + child.budgetAmount');
    expect(budget).not.toContain('With subcategories:');
  });

  it('says where a parent row got its figure', () => {
    expect(budget).toContain('From its subcategories');
  });

  it('offers no budget field while editing a parent', () => {
    // There is nothing to set: the figure is its subcategories added up.
    expect(budget).toContain('const editingParent = editTarget != null && allCategories.some((row) => row.parentId === editTarget.id);');
    expect(budget).toContain('testID="parent-budget-note"');
    expect(budget).toContain('is budgeted through its subcategories');
  });

  it('still offers the field for an ordinary category', () => {
    expect(budget).toContain("{editingParent ? (");
    expect(budget).toContain("'AVERAGE MONTHLY AMOUNT (KES)' : 'BUDGET AMOUNT (KES)'");
  });
});

describe('the server settles the figures', () => {
  it('makes a parent the sum of its subcategories', () => {
    expect(route).toContain('const budgets = effectiveBudgets(categories);');
    expect(route).toContain('const budgetAmount = budgets.get(cat.id) ?? cat.budgetAmount;');
  });

  it('rolls the children spending up too, so the comparison is honest', () => {
    // A branch budget against only what was charged to the parent by name
    // would report money left that the subcategories have already spent.
    expect(route).toContain('const spentAmount = (ownSpent.get(cat.id) ?? 0) + (childSpent.get(cat.id) ?? 0);');
  });

  it('measures unbudgeted spending from direct charges only', () => {
    // A parent that has absorbed its children would be counted twice against
    // the month's real total and would hide genuinely unbudgeted spending.
    expect(route).toContain('const budgetedActual = Array.from(ownSpent.values()).reduce((sum, spent) => sum + spent, 0);');
  });

  it('stops the month total counting a parent against its own children', () => {
    expect(route).toContain('const totalBudget = sumBudget(budgetRows);');
    expect(route).not.toContain('COALESCE(SUM(${budgetCategoriesTable.budgetAmount}), 0)');
  });

  it('applies the same rule to the handed-out PDF', () => {
    expect(route).toContain('const reportBudgets = effectiveBudgets(categories);');
    expect(route).toContain('const totalBudget = sumBudget(categories);');
  });
});

describe('a parent is drawn as a different colour from its children', () => {
  it('gives a parent a tinted panel, and leaves the children plain', () => {
    expect(budget).toContain("hasSubcategories ? { backgroundColor: colors.accent, borderColor: colors.accentForeground + '55' } : null,");
  });

  it('changes nothing for a category with no subcategories', () => {
    expect(budget).toContain('hasSubcategories: mine.length > 0');
  });

  it('keeps the caption readable on that panel', () => {
    // `primary` on the accent panel is 2.02:1 in dark mode — unreadable.
    expect(budget).toContain('<Text style={[styles.rollupLine, { color: colors.accentForeground }]}>');
  });
});

describe('the breakdown says who a category belongs to', () => {
  it('names the parent, because the breakdown is keyed by name', () => {
    expect(route).toContain('parentName: cat.parentId != null ? (categoryNameById.get(cat.parentId) ?? null) : null');
  });

  it('resolves the name from every category, not just this month', () => {
    // A child whose parent is not active this month still knows whose it is.
    expect(route).toContain('const categoryNameById = new Map(allGroupCategories.map((row) => [row.id, row.name]));');
  });

  it('gives unbudgeted spending no parent', () => {
    const unbudgeted = route.slice(route.indexOf('category: "Unbudgeted spending"'));
    expect(unbudgeted.slice(0, 600)).toContain('parentName: null');
  });
});
