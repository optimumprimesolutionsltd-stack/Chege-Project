import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { budgetReport } from '../budgetReport';

const screen = readFileSync('app/(tabs)/reports.tsx', 'utf8');

// "17 categories over", figures cut off on the right, and Stock unlinked by one tap.
describe('Budget utilisation on Reports', () => {
  it('counts over the way the Budget report does', () => {
    expect(screen).toContain('const overRows = useMemo(() => budgetReport(catBreakdown as any[]).over, [catBreakdown]);');
    const { over } = budgetReport([
      { category: 'Food', budgetAmount: 10000, spentAmount: 12000 },
      { category: 'Groceries', budgetAmount: 10000, spentAmount: 12000, parentName: 'Food' },
      { category: 'Unbudgeted spending', budgetAmount: 0, spentAmount: 5000, isBudgeted: false },
    ]);
    expect(over.map((row) => row.category)).toEqual(['Groceries']);
  });

  it('keeps the amount on the right on the card', () => {
    expect(screen).toContain('<View style={{ flex: 1, minWidth: 0 }}>');
    expect(screen).toContain("utilisationVariance: { alignItems: 'flex-end', gap: 2, flexShrink: 0, maxWidth: '45%' },");
  });
});

describe('unlinking a cost category', () => {
  it('asks first', () => {
    expect(screen).toContain("{ text: 'Stop counting it', style: 'destructive', onPress: () => void applyCostCategoryChange(category.id, null) },");
  });
});

// "Transport is not picking expense": the Expense button sat off the card.
describe('a cost category row', () => {
  it('puts its kind buttons on their own line, wrapping', () => {
    expect(screen).toContain("costCategoryOption: { flexDirection: 'column', alignItems: 'stretch',");
    expect(screen).toContain("<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }} testID={`cost-kind-${category.id}`}>");
  });
});
