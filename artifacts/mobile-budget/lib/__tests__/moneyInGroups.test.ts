import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const screen = readFileSync('app/sort-entries.tsx', 'utf8').replace(/\r\n/g, '\n');

// "salary, business income and passed through - inside passed through you can
// list the businesses" (10 Oct 2026).
describe('money in on Sort them out, grouped by what it is', () => {
  it('shows Pay / income, My business (sales), Passed through (not mine) and Borrowed', () => {
    for (const title of ["'PAY / INCOME'", "'MY BUSINESS (SALES)'", "'PASSED THROUGH (NOT MINE)'", "'BORROWED / PAID BACK'"]) expect(screen).toContain(title);
  });

  it('puts each business in its group by how it pays the person', () => {
    expect(screen).toContain('const pay = incomeSources.filter((source) => !businessOf.has(source.id));');
    expect(screen).toContain('const sales = incomeSources.filter((source) => businessOf.get(source.id)?.countsProfit === true);');
    expect(screen).toContain('const notMine = incomeSources.filter((source) => businessOf.get(source.id)?.countsProfit === false);');
  });

  it('opens the pass-through sheet on the kind tapped, and keeps the business-account choice', () => {
    expect(screen).toContain("action('I was holding it for someone', 'repeat', () => passThrough('held')");
    expect(screen).toContain("action('Someone who owed me paid someone I owe', 'repeat', () => passThrough('settle')");
    expect(screen).toContain("From my business's own account (not a sale)");
    expect(screen).toContain('mode={pairMode}');
  });
});
