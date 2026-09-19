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
    expect(budget).toContain('for (const child of mine) ordered.push({ row: child, isChild: true, rollup: null });');
    expect(budget).toContain('{orderedBreakdown.map(({ row: cat, isChild, rollup }) => {');
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

describe("a parent shows its own figure and the branch total", () => {
  it('adds the children onto the parent for the rolled-up line', () => {
    expect(budget).toContain('budgetAmount: mine.reduce((sum, child) => sum + child.budgetAmount, row.budgetAmount)');
    expect(budget).toContain('spentAmount: mine.reduce((sum, child) => sum + child.spentAmount, row.spentAmount)');
  });

  it('shows the rolled-up total beneath the parent, not instead of it', () => {
    expect(budget).toContain('With subcategories:');
    // The row's own spent/budget pair is untouched above it.
    expect(budget).toContain('<Text style={[styles.catSpent, { color: colors.foreground }]}>{formatKES(cat.spentAmount)}</Text>');
  });

  it('shows nothing extra for a category with no children', () => {
    expect(budget).toContain('const rollup = mine.length > 0');
    expect(budget).toContain('{rollup ? (');
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

// Indenting alone left a parent and its children reading as the same kind of
// row at a glance.
describe('a parent is drawn as a different colour from its children', () => {
  it('gives a parent a tinted panel, and leaves the children plain', () => {
    expect(budget).toContain("rollup ? { backgroundColor: colors.accent, borderColor: colors.accentForeground + '55' } : null,");
  });

  it('changes nothing for a category with no subcategories', () => {
    // `rollup` is null unless the row actually heads a branch, so a plain
    // category keeps the card it always had.
    expect(budget).toContain('const rollup = mine.length > 0');
  });

  it('keeps the rolled-up line readable on that panel', () => {
    // `primary` on the accent panel is 2.02:1 in dark mode — unreadable. This
    // line only ever renders on a parent, so it always sits on that panel.
    expect(budget).toContain('<Text style={[styles.rollupLine, { color: colors.accentForeground }]}>');
  });
});
