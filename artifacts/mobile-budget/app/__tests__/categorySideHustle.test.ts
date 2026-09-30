import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const screen = readFileSync('app/(tabs)/budget.tsx', 'utf8').replace(/\r\n/g, '\n');

// "How do you link? If it's hard for me to understand, it will be hard for someone else."
describe('a category for a side hustle, set where the category is named', () => {
  it('is a third answer to What is this, offered once there is an income stream', () => {
    expect(screen).toContain("...(incomeSources.length > 0 ? [{ key: 'business', label: 'Related to an income stream', testID: 'category-kind-business' }] : []),");
  });

  it('asks which side hustle, and whether it is stock or a running expense', () => {
    expect(screen).toContain('WHICH INCOME STREAM?');
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
