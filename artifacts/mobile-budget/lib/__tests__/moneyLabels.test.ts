import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');

// "Why the difference between how much did I spend this month and went out"
// (5 Oct 2026): each named for what it counts.
describe('Home names its money figures for what they count', () => {
  // "Still feel the homepage is a lot ... two places showing mpesa balance" (16 Oct 2026).
  it("the M-Pesa card no longer repeats the balance or the month's money in and out", () => {
    const card = read('components/MpesaImportCard.tsx');
    expect(card).not.toContain("label: 'Into M-Pesa'");
    expect(card).not.toContain('mpesa-home-card-live-balance');
    expect(card).not.toContain("'Went out'");
    expect(card).toContain('testID="mpesa-home-card-open"');
  });

  it('calls spending what it is, and says what it leaves out', () => {
    const answers = read('components/HomeAnswersCard.tsx');
    expect(answers).toContain('Spent on your budget this month');
    expect(answers).toContain('Spending only - not savings, transfers, money lent or repayments');
  });
});
