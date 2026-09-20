import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mobileBudget = readFileSync('app/(tabs)/budget.tsx', 'utf8');
const webBudget = readFileSync('../family-budget/src/pages/budget.tsx', 'utf8');

// A blank amount used to be accepted when editing and refused when creating,
// so a new category could not be added without a figure. That blocked the one
// thing the new model asks for first: a heading, whose amount is cleared the
// moment a subcategory goes under it anyway.
describe('a blank budget amount means nothing budgeted yet', () => {
  it('accepts it when creating as well as editing, on the phone', () => {
    expect(mobileBudget).toContain("const rawAmount = formAmount.trim();");
    expect(mobileBudget).toContain("const amt = rawAmount === '' ? 0 : parseInt(rawAmount, 10);");
  });

  it('accepts it in the web category editor too', () => {
    expect(webBudget).toContain('const parsedAmount = amount.trim() === "" ? 0 : parseInt(amount, 10);');
  });

  it('says so in the same words on both', () => {
    for (const source of [mobileBudget, webBudget]) {
      expect(source).toContain('Leave it blank, or enter 0, if you are not budgeting this yet.');
    }
  });

  it('still refuses something that is not a number', () => {
    // Blank is a decision; "abc" is a mistake, and the two deserve different
    // answers.
    expect(mobileBudget).toContain('Enter a whole number of shillings, or leave it blank to budget it later.');
  });

  it('names the missing field rather than lumping both together', () => {
    expect(mobileBudget).toContain("Alert.alert('Name required'");
    expect(mobileBudget).toContain("Alert.alert('Amount not valid'");
  });
});
