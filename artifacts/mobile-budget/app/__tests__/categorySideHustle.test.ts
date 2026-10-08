import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const screen = readFileSync('app/(tabs)/budget.tsx', 'utf8').replace(/\r\n/g, '\n');

// "How do you link? If it's hard for me to understand, it will be hard for someone else."
describe('a category for a side hustle, set where the category is named', () => {
  // A business's cost, never an income stream's: "remove logic of income streams as businesses" (8 Oct 2026).
  it("is a third answer to What is this, offered once there is a business", () => {
    expect(screen).toContain(`...(businesses.list.length > 0 ? [{ key: 'business', label: "A business's cost", testID: 'category-kind-business' }] : []),`);
    expect(screen).not.toContain('Related to an income stream');
  });

  it('asks which business, and whether it is stock or a running expense', () => {
    expect(screen).toContain('WHICH BUSINESS?');
    expect(screen).toContain('{businesses.list.map((source) => {');
    expect(screen).toContain("{ key: 'cogs', label: 'Stock / goods to sell' },");
    expect(screen).toContain("{ key: 'expense', label: 'Running expense' },");
  });

  it('saves the link every time, so a regular category takes it off', () => {
    expect(screen).toContain('reducesIncomeSourceId: formIsGroup ? null : formCostSourceId,');
    expect(screen).toContain('...(formCostSourceId != null && !formIsGroup ? { costKind: formCostKind } : {}),');
  });

  it('opens an existing category with its link as it is', () => {
    expect(screen).toContain('setFormCostSourceId(linked.reducesIncomeSourceId ?? null);');
  });
});
