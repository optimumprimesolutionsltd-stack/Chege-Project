import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// "Can you attach a category to a business like the way we were linking to an
// income stream ... yes add it to the business report" (8 Oct 2026). The
// tick-several sheet was on Reports, under each income stream; an income
// stream is never a business now, so it opens from the business itself.
const sheet = readFileSync('components/BusinessCostCategories.tsx', 'utf8');
const report = readFileSync('app/business.tsx', 'utf8');
const businesses = readFileSync('app/businesses.tsx', 'utf8');
const reports = readFileSync('app/(tabs)/reports.tsx', 'utf8');

describe("a business's cost categories", () => {
  it('open from every statement on the Business report, and from each business in My businesses', () => {
    expect(report).toContain('<BusinessCostCategories business={costsFor} onClose={() => setCostsFor(null)} />');
    expect(businesses).toContain('<BusinessCostCategories business={costsFor} onClose={() => setCostsFor(null)} />');
    expect(businesses).toContain('testID={`business-cost-categories-${business.id}`}');
  });

  it('are gone from Reports, whose income streams are income', () => {
    expect(reports).not.toContain('costCategoryFor');
    expect(reports).not.toContain('Link a cost category');
    expect(reports).not.toContain('costsFor');
  });

  it('tick several, each saved as it is tapped, without touching the others', () => {
    expect(sheet).toContain('await updateCategory.mutateAsync({ id: categoryId, data: { reducesIncomeSourceId } });');
    expect(sheet).toContain('void applyLink(category.id, business.id);');
  });

  it('ask before unticking, and before moving one off another business', () => {
    expect(sheet).toContain("{ text: 'Stop counting it', style: 'destructive', onPress: () => void applyLink(category.id, null) },");
    expect(sheet).toContain("{ text: 'Move it', onPress: () => void applyLink(category.id, business.id) },");
  });

  it('read a link to an income stream, from before, as no link', () => {
    expect(sheet).toContain('return link != null && businesses.ids.has(link) ? link : null;');
  });

  it('list only categories that carry spending, not ones holding sub-categories', () => {
    expect(sheet).toContain('.filter((category) => !categories.some((other) => other.parentId === category.id))');
  });

  it('refresh the categories, the statement and every personal figure after a change', () => {
    expect(sheet).toContain('await queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });');
    expect(sheet).toContain("void queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0] ?? '').startsWith('/api/dashboard') });");
  });
});

// "already sorted, why does it still show?" (8 Oct 2026): money from your
// business is your own money, not income, and Sort them out already said so.
describe('money from your business on Bank', () => {
  it('is not tagged Not sure', () => {
    expect(readFileSync('app/(tabs)/bank.tsx', 'utf8')).toContain('&& !ownerBusiness.markedIds.has(item.id) ? (');
  });
});

// "We agreed stock expenses should not show in personal expenses" (8 Oct 2026):
// costs linked to an income stream before #674 count as personal now, so the
// sheet names them and lists them first, one tap from a business.
describe('a cost linked to an income stream before', () => {
  it('is named on the sheet, with what it counts as now, and listed first', () => {
    expect(sheet).toContain('testID={`business-cost-was-stream-${category.id}`}');
    expect(sheet).toContain('Was a cost of {oldStreamOf(category)} - it counts as your personal spending now.');
    expect(sheet).toContain('.sort((a, b) => Number(oldStreamOf(b) != null) - Number(oldStreamOf(a) != null));');
  });

  it('is only an income stream link, never a business one', () => {
    expect(sheet).toContain('if (link == null || businesses.ids.has(link)) return null;');
  });
});
