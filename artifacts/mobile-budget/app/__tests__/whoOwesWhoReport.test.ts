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
