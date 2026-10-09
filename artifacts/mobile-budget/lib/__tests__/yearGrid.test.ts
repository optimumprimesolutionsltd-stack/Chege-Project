import { describe, expect, it } from 'vitest';
import { cellText, yearGrid, yearMonths, type BreakdownRow, type IncomeMonth } from '../yearGrid';

const today = { year: 2026, month: 3 };
const months = yearMonths(2026, today);

// Food > Groceries / Eating out; Rent on its own; Ujenzi's materials a business cost
// under the personal Household heading. The server gives a heading its children's
// spending added in, so Food is 900 when Groceries 600 + Eating out 300.
const jan: BreakdownRow[] = [
  { category: 'Food', spentAmount: 900 },
  { category: 'Groceries', spentAmount: 600, parentName: 'Food' },
  { category: 'Eating out', spentAmount: 300, parentName: 'Food' },
  { category: 'Rent', spentAmount: 10_000 },
  { category: 'Household', spentAmount: 2_500 },
  { category: 'Ujenzi - materials', spentAmount: 2_000, parentName: 'Household', isBusinessCost: true },
  { category: 'Cleaning supplies', spentAmount: 500, parentName: 'Household' },
];
const feb: BreakdownRow[] = [
  // 100 filed on Food itself, from before amounts moved to subcategories.
  { category: 'Food', spentAmount: 1_300 },
  { category: 'Groceries', spentAmount: 1_200, parentName: 'Food' },
  { category: 'Rent', spentAmount: 10_000 },
];
const mar: BreakdownRow[] = [{ category: 'Groceries', spentAmount: 5_000, parentName: 'Food' }, { category: 'Food', spentAmount: 5_000 }];
const income: IncomeMonth[] = [
  { streams: [{ sourceName: 'Salary', total: 50_000 }, { sourceName: 'Ujenzi', total: 8_000 }] },
  { streams: [{ sourceName: 'Salary', total: 50_000 }] },
  { streams: [{ sourceName: 'Salary', total: 20_000 }] },
];

describe('yearMonths', () => {
  it('runs January to the month in progress this year, all twelve for a past year, none ahead', () => {
    expect(months.map((m) => m.label)).toEqual(['Jan', 'Feb', 'Mar']);
    expect(months.map((m) => m.soFar)).toEqual([false, false, true]);
    expect(yearMonths(2025, today)).toHaveLength(12);
    expect(yearMonths(2025, today).some((m) => m.soFar)).toBe(false);
    expect(yearMonths(2027, today)).toEqual([]);
  });
});

describe('yearGrid', () => {
  const grid = yearGrid(months, [jan, feb, mar], income);
  const row = (rows: typeof grid.spending, name: string) => rows.find((one) => one.name === name)!;

  it('puts subcategories under their heading, and never counts a heading twice', () => {
    const food = row(grid.spending, 'Food');
    expect(food.children.map((child) => child.name)).toEqual(['Groceries', 'Eating out', 'Food (not in a subcategory)']);
    expect(food.amounts).toEqual([900, 1_300, 5_000]);
    expect(row(food.children, 'Food (not in a subcategory)').amounts).toEqual([0, 100, 0]);
    expect(grid.moneyOut).toEqual([900 + 10_000 + 500, 1_300 + 10_000, 5_000]);
  });

  it("keeps a business's costs apart from money out, even under a personal heading", () => {
    expect(row(grid.spending, 'Household').amounts).toEqual([500, 0, 0]);
    expect(row(grid.businessCosts, 'Household').children.map((child) => child.name)).toEqual(['Ujenzi - materials']);
    expect(grid.businessCosts[0].total).toBe(2_000);
  });

  it('lists every stream, adds money in, and what was left each month', () => {
    expect(grid.income.map((one) => one.name)).toEqual(['Salary', 'Ujenzi']);
    expect(grid.moneyIn).toEqual([58_000, 50_000, 20_000]);
    expect(grid.leftOver).toEqual([58_000 - 11_400, 50_000 - 11_300, 20_000 - 5_000]);
  });

  it('marks the highest complete month in a row, never the month in progress', () => {
    // March's 5,000 groceries is the most, but March is not over.
    expect(row(row(grid.spending, 'Food').children, 'Groceries').peak).toBe(1);
    // Rent was the same both months: the first is marked.
    expect(row(grid.spending, 'Rent').peak).toBe(0);
    // A row with one month to its name has nothing to compare.
    expect(row(row(grid.spending, 'Food').children, 'Eating out').peak).toBe(-1);
  });

  it('largest first, empty rows left out', () => {
    expect(grid.spending.map((one) => one.name)).toEqual(['Rent', 'Food', 'Household']);
  });

  it('copes with a month whose reports have not come yet', () => {
    const partial = yearGrid(months, [jan, undefined, undefined], [income[0], undefined, undefined]);
    expect(partial.moneyOut).toEqual([11_400, 0, 0]);
    expect(partial.moneyIn).toEqual([58_000, 0, 0]);
  });
});

describe('cellText', () => {
  it('fits a column', () => {
    expect(cellText(0)).toBe('–');
    expect(cellText(12_400)).toBe('12,400');
    expect(cellText(-3_000)).toBe('−3,000');
    expect(cellText(1_250_000)).toBe('1.3M');
    expect(cellText(12_000_000)).toBe('12M');
  });
});
