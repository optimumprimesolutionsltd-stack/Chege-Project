import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const budget = readFileSync('app/(tabs)/budget.tsx', 'utf8');

describe('expected income on the Budget tab follows the month on screen', () => {
  it('loads what each source was expected to bring in that month', () => {
    expect(budget).toContain("queryKey: ['income-sources', 'budget-report', year, month],");
    expect(budget).toContain('`/api/income-sources?year=${year}&month=${month}`');
  });

  it('asks how far a change reaches, from both ways of editing it', () => {
    expect(budget).toContain("'Change expected income?',");
    expect(budget).toContain("{ text: `From ${label} on`, onPress: () => go({ expectedFrom: { year, month } }) },");
    expect(budget).toContain("{ text: `Only ${label}`, onPress: () => go({ onlyThisMonth: { year, month } }) },");
    expect(budget.match(/askIncomeReach\(/g)?.length).toBe(2); // the batch edit and the single figure
  });
});
