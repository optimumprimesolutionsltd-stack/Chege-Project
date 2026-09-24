import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { groupByCategory, groupByItem, SPLIT_LABEL } from '@/lib/groupExpenses';

const entry = (id: string, description: string, amount: number, categories: string[], date = '2026-09-10') => ({
  id, description, amount, categories, date,
});

const entries = [
  entry('1', 'Milk', 120, ['Groceries'], '2026-09-12'),
  entry('2', ' milk ', 130, ['Groceries'], '2026-09-05'),
  entry('3', 'Bread', 60, ['Groceries'], '2026-09-04'),
  entry('4', 'Matatu', 200, ['Transport'], '2026-09-03'),
  entry('5', 'Shopping', 900, ['Groceries', 'Household'], '2026-09-02'),
  entry('6', 'Mystery', 10, [], '2026-09-01'),
];

// "In all expenses page, group the expenses by item and by category."
describe('groupByCategory', () => {
  it('totals whole expenses per category, biggest first', () => {
    const groups = groupByCategory(entries);
    expect(groups.map((g) => [g.label, g.total, g.count])).toEqual([
      [SPLIT_LABEL, 900, 1],
      ['Transport', 200, 1],
      ['Groceries', 310, 3],
      ['Uncategorised', 10, 1],
    ].sort((a, b) => (b[1] as number) - (a[1] as number) || String(a[0]).localeCompare(String(b[0]))));
  });

  it('never guesses a share for an expense split across categories', () => {
    const groceries = groupByCategory(entries).find((g) => g.label === 'Groceries');
    expect(groceries?.total).toBe(310);
    expect(groupByCategory(entries).find((g) => g.label === SPLIT_LABEL)?.rows).toHaveLength(1);
  });

  it('adds up to the ledger total', () => {
    const sum = groupByCategory(entries).reduce((total, g) => total + g.total, 0);
    expect(sum).toBe(entries.reduce((total, e) => total + e.amount, 0));
  });
});

describe('groupByItem', () => {
  it('treats spellings of one thing as one item, labelled by its latest spelling', () => {
    const milk = groupByItem(entries).find((g) => g.label === 'Milk');
    expect(milk).toMatchObject({ total: 250, count: 2 });
  });

  it('lists the biggest item first and keeps each group\'s entries', () => {
    const groups = groupByItem(entries);
    expect(groups[0].label).toBe('Shopping');
    expect(groups.find((g) => g.label === 'Matatu')?.rows.map((r) => r.id)).toEqual(['4']);
  });

  it('adds up to the ledger total', () => {
    const sum = groupByItem(entries).reduce((total, g) => total + g.total, 0);
    expect(sum).toBe(entries.reduce((total, e) => total + e.amount, 0));
  });
});

describe('the All expenses screen', () => {
  const screen = readFileSync('app/expense-ledger.tsx', 'utf8').replace(/\r\n/g, '\n');
  it('offers the three views and files entries into expandable groups', () => {
    expect(screen).toContain("['category', 'By category']");
    expect(screen).toContain("['item', 'By item']");
    expect(screen).toContain('(view === \'category\' ? categoryGroups : itemGroups).map');
    expect(screen).toContain('group.rows.map(renderEntry)');
  });
});
