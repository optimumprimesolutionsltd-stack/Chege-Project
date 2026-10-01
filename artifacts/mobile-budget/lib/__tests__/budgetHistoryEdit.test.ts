import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const budget = readFileSync('app/(tabs)/budget.tsx', 'utf8');

// "Budgets that differ by month, January at one amount and October at
// another" - with earlier months keeping the budget they had.
describe('changing a budget on the Budget tab', () => {
  it('starts the form from the budget the category had in the month on screen', () => {
    expect(budget).toContain('const shown = cat.isRecurring && monthRow && !isHeading ? Number(monthRow.budgetAmount) : cat.budgetAmount;');
    expect(budget).toContain('setEditMonthAmount(shown);');
  });

  it('asks how far a change reaches: this month on (first), or this month alone', () => {
    expect(budget).toContain('`Change the ${formName.trim()} budget?`');
    expect(budget).toContain('Months before ${label} keep the budget they had.');
    expect(budget).toContain("{ text: `From ${label} on`, onPress: () => void saveCategory({ budgetFrom: { year, month } }) },");
    expect(budget).toContain("{ text: `Only ${label}`, onPress: () => void saveCategory({ onlyThisMonth: { year, month } }) },");
  });

  it('sends the answer with the edit, and nothing extra when creating', () => {
    expect(budget).toContain('...(editTarget && reach ? reach : {}),');
  });
});
