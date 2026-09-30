import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// "Why can't I see a report of who owes me and who I owe?"
describe('Who owes who as a report', () => {
  it('is on Reports', () => {
    expect(readFileSync('app/(tabs)/reports.tsx', 'utf8')).toContain("router.push('/parties')");
  });

  it('downloads as a PDF of its own', () => {
    expect(readFileSync('app/parties.tsx', 'utf8')).toContain('{ includeSummary: false, includeBudget: false, includeIncome: false, includeDebts: true }');
  });
});

// "It shows no one owes me and I don't owe anyone."
describe('Who owes who from the entries', () => {
  it('offers the balances worked out from linked entries, and sets them only when asked', () => {
    const screen = readFileSync('app/parties.tsx', 'utf8');
    expect(screen).toContain("customFetch<{ changes: WorkedChange[]; toLink?: number }>('/api/contributors/worked-out')");
    expect(screen).toContain("text: 'Use these',");
    expect(screen).toContain('testID="parties-work-out"');
  });
});

// "Bring the Debt tab to the Home screen too."
describe('Debt on Home', () => {
  it('is one of the group areas', () => {
    expect(readFileSync('app/(tabs)/index.tsx', 'utf8')).toContain("label: 'Debt',        color: '#F87171', bg: '#3A1212', route: '/(tabs)/debt'");
  });
});
