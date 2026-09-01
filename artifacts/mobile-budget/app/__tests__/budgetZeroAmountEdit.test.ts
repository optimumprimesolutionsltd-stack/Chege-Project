import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mobileBudget = readFileSync('app/(tabs)/budget.tsx', 'utf8');
const webBudget = readFileSync('../family-budget/src/pages/budget.tsx', 'utf8');

describe('zero budget amount editing', () => {
  it('treats a cleared amount as zero only when editing an existing mobile category', () => {
    expect(mobileBudget).toContain("const rawAmount = formAmount.trim();");
    expect(mobileBudget).toContain("const amt = rawAmount === '' && editTarget ? 0 : parseInt(rawAmount, 10);");
    expect(mobileBudget).toContain('Enter 0, or clear the amount while editing, to pause this budget.');
  });

  it('keeps the same zero-value behavior in the web category editor', () => {
    expect(webBudget).toContain('const parsedAmount = amount.trim() === "" && initial ? 0 : parseInt(amount, 10);');
    expect(webBudget).toContain('Enter 0, or clear the amount while editing, to pause this budget.');
  });
});