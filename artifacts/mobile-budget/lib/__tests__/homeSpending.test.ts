import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultAtHome, homeVsOutside } from '../homeSpending';

const row = (category: string, spentAmount: number, parentName: string | null = null, isBusinessCost = false) => ({ category, spentAmount, parentName, isBusinessCost });

describe('at home vs outside, in Reports only', () => {
  it('puts the running of the home at home - education included - and eating out outside', () => {
    expect(defaultAtHome('Rent', 'Housing')).toBe(true);
    expect(defaultAtHome('Electricity', 'Utilities')).toBe(true);
    expect(defaultAtHome('Groceries', 'Food')).toBe(true);
    expect(defaultAtHome('House help', 'Household')).toBe(true);
    // "education is part of home" (10 Oct 2026).
    expect(defaultAtHome('School fees', 'Education')).toBe(true);
    expect(defaultAtHome('Clubs', 'Education')).toBe(true);
    expect(defaultAtHome('Home internet', 'Airtime & data')).toBe(true);
    // "health is part of home" (10 Oct 2026).
    expect(defaultAtHome('Medicine', 'Health')).toBe(true);
    expect(defaultAtHome('Hospital & clinic', 'Health')).toBe(true);
    expect(defaultAtHome('Health')).toBe(true);
    expect(defaultAtHome('Eating out', 'Food')).toBe(false);
    expect(defaultAtHome('Fuel', 'Transport')).toBe(false);
    expect(defaultAtHome('Data bundles', 'Airtime & data')).toBe(false);
    expect(defaultAtHome('My own category')).toBe(false);
  });

  it('adds each subcategory on its side, and a parent only for what was filed under it directly', () => {
    const sides = homeVsOutside([
      row('Food', 12000),
      row('Groceries', 8000, 'Food'),
      row('Eating out', 3000, 'Food'),
      row('Utilities', 4000),
      row('Electricity', 4000, 'Utilities'),
      row('Transport', 5000),
    ], new Map());
    // Food's own 1,000 (12,000 less its subcategories) is outside; Groceries is home.
    expect(sides.home.total).toBe(12000);
    expect(sides.outside.total).toBe(9000);
    expect(sides.home.items.map((item) => item.category)).toEqual(['Groceries', 'Electricity']);
    expect(sides.outside.items.map((item) => [item.category, item.spent])).toEqual([['Transport', 5000], ['Eating out', 3000], ['Food', 1000]]);
    expect(sides.homePercent).toBe(57);
  });

  it('follows a side the person chose over the default', () => {
    const sides = homeVsOutside([row('Eating out', 3000, 'Food'), row('Rent', 15000, 'Housing')], new Map([['Eating out', true], ['Rent', false]]));
    expect(sides.home.items).toEqual([expect.objectContaining({ category: 'Eating out', chosen: true })]);
    expect(sides.outside.items).toEqual([expect.objectContaining({ category: 'Rent', chosen: true })]);
  });

  it("leaves out a business's costs and money not yet sorted", () => {
    const sides = homeVsOutside([row('Stock & inventory', 50000, null, true), row('Not sure yet', 2000), row('Rent', 15000, 'Housing')], new Map());
    expect(sides.home.total + sides.outside.total).toBe(15000);
  });

  it('shows on Reports, following the server only while Reports is in view', () => {
    const reports = readFileSync(join(__dirname, '../../app/(tabs)/reports.tsx'), 'utf8');
    expect(reports).toContain('<HomeSpendingCard');
    const card = readFileSync(join(__dirname, '../../components/HomeSpendingCard.tsx'), 'utf8');
    expect(card).toContain('subscribed: onScreen');
    expect(card).toContain("customFetch<Places>('/api/category-places')");
  });
});
