import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { categoryMovers, comparedPair, comparisonRows, monthlyHighlights } from '@/lib/monthlyComparison';

// "A monthly comparison especially on income and expenses with highlights" (7 Oct 2026).
const spending = [
  { year: 2026, month: 5, label: 'May 2026', totalSpent: 40000 },
  { year: 2026, month: 6, label: 'Jun 2026', totalSpent: 52000 },
  { year: 2026, month: 7, label: 'Jul 2026', totalSpent: 38000 },
  { year: 2026, month: 8, label: 'Aug 2026', totalSpent: 45000 },
  { year: 2026, month: 9, label: 'Sep 2026', totalSpent: 60000 },
  { year: 2026, month: 10, label: 'Oct 2026', totalSpent: 9000 },
];
const months = spending.map(({ year, month, label }) => ({ year, month, label }));
const income = {
  months,
  streams: [
    { sourceName: 'Salary', amounts: [50000, 50000, 50000, 50000, 50000, 0] },
    { sourceName: 'Side hustle', amounts: [5000, 0, 8000, 6000, 1000, 2000] },
  ],
};
const today = { year: 2026, month: 10 };

describe('month by month', () => {
  const rows = comparisonRows(spending, income, today);

  it('adds every income stream, takes spending off it, and marks the month in progress', () => {
    expect(rows.map((row) => row.net)).toEqual([15000, -2000, 20000, 11000, -9000, -7000]);
    expect(rows[5].soFar).toBe(true);
    expect(rows.slice(0, 5).every((row) => !row.soFar)).toBe(true);
  });

  it('compares the last complete month with the one before, never the month in progress', () => {
    const pair = comparedPair(rows)!;
    expect(pair.latest.label).toBe('Sep 2026');
    expect(pair.previous.label).toBe('Aug 2026');
  });

  it('says what changed, good news and bad', () => {
    const texts = monthlyHighlights(rows, undefined, income).map((h) => `${h.tone}: ${h.text}`);
    expect(texts[0]).toBe('bad: In Sep you spent KES 9,000 more than came in (KES 51,000 in, KES 60,000 out).');
    expect(texts).toContain('bad: Income down KES 5,000 (9%) on Aug.');
    expect(texts).toContain('bad: Spending up KES 15,000 (33%) on Aug.');
    expect(texts).toContain('bad: Side hustle brought in KES 5,000 less than in Aug.');
    expect(texts).toContain("bad: Sep's spending was 28% above your 5-month average of KES 47,000.");
    expect(texts).toContain('neutral: Best month: Jul 2026, when you kept KES 20,000.');
    expect(texts).toContain('neutral: In 2 of the last 5 months you spent more than came in.');
  });

  it('finds the categories that moved most, counting subcategories and not their headings', () => {
    const latest = [
      { category: 'Food', spentAmount: 20000 }, { category: 'Eating out', spentAmount: 12000, parentName: 'Food' },
      { category: 'Groceries', spentAmount: 8000, parentName: 'Food' }, { category: 'Fuel', spentAmount: 3000, parentName: 'Transport' },
    ];
    const previous = [
      { category: 'Food', spentAmount: 13000 }, { category: 'Eating out', spentAmount: 3000, parentName: 'Food' },
      { category: 'Groceries', spentAmount: 10000, parentName: 'Food' }, { category: 'Fuel', spentAmount: 3000, parentName: 'Transport' },
    ];
    const { up, down } = categoryMovers(latest, previous, 1);
    expect(up).toEqual([{ category: 'Eating out', now: 12000, before: 3000, diff: 9000 }]);
    expect(down).toEqual([{ category: 'Groceries', now: 8000, before: 10000, diff: -2000 }]);
    const texts = monthlyHighlights(rows, { latest, previous }).map((h) => h.text);
    expect(texts).toContain('Eating out rose the most: KES 3,000 in Aug, KES 12,000 in Sep.');
  });

  it('says nothing until there are two complete months', () => {
    expect(monthlyHighlights(comparisonRows(spending.slice(4), income, today))).toEqual([]);
  });

  it('is on Reports', () => {
    expect(readFileSync('app/(tabs)/reports.tsx', 'utf8')).toContain('<MonthlyComparisonCard />');
  });
});
