import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(__dirname, '..', '..', path), 'utf8');

describe('hidden group areas on Home', () => {
  it('says how many are hidden and opens Arrange to bring them back', () => {
    const home = read('app/(tabs)/index.tsx');
    expect(home).toContain('{overviewShortcuts.length < allShortcuts.length ? (');
    expect(home).toContain('testID="overview-shortcut-more"');
    expect(home).toContain('Tap Arrange to put them in your order');
  });
});

describe('a new parent category from the category form', () => {
  it('offers New among the headings, creates it and chooses it', () => {
    const budget = read('app/(tabs)/budget.tsx');
    expect(budget).toContain('testID="category-parent-new"');
    expect(budget).toContain("const created = await customFetch<{ id: number }>('/api/budget-categories', {");
    expect(budget).toContain('if (created?.id != null) setFormParentId(Number(created.id));');
    expect(budget).toContain('contentContainerStyle={{ gap: 8 }}');
  });
});

describe('the Contributions view', () => {
  it('shows each member through the card, last month beside the total, and an empty month with a way to start', () => {
    const history = read('app/(tabs)/history.tsx');
    expect(history).toContain('<ContributionMemberCard key={member.userId}');
    expect(history).toContain('testID="contributions-vs-last-month"');
    expect(history).toContain('testID="contributions-empty-month"');
    expect(history).toContain('const contributionRows = useMemo(() => contributionsByDay(contributions), [contributions]);');
  });
});
