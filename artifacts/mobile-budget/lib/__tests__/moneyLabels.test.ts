import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');

// "Why the difference between how much did I spend this month and went out"
// (5 Oct 2026): each named for what it counts.
describe('Home names its money figures for what they count', () => {
  it('calls the M-Pesa card figures money into and out of M-Pesa, and says they are not spending', () => {
    const card = read('components/MpesaImportCard.tsx');
    expect(card).toContain("label: 'Into M-Pesa'");
    expect(card).toContain("label: 'Left M-Pesa'");
    expect(card).not.toContain("'Went out'");
    expect(card).toContain('savings, transfers and repayments included');
  });

  it('calls spending what it is, and says what it leaves out', () => {
    const answers = read('components/HomeAnswersCard.tsx');
    expect(answers).toContain('Spent on your budget this month');
    expect(answers).toContain('Spending only - not savings, transfers, money lent or repayments');
  });
});
