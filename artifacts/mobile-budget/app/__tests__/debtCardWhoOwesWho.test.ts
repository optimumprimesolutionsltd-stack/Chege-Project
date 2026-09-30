import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const card = readFileSync('components/DebtSummaryCard.tsx', 'utf8');

// "I thought Who owes who should reflect in the debt card?"
describe('the Home debt card and Who owes who', () => {
  it('shows money owed to you, not only money you owe', () => {
    expect(card).toContain('const owedToYou = parties.reduce((total, party) => total + Math.max(0, party.owedToUs ?? 0), 0);');
    expect(card).toContain('testID="home-debt-owed-to-you"');
    expect(card).toContain('testID="home-debt-owed-to-you-card"');
  });

  it('is not all clear while money is still owed to people', () => {
    expect(card).toContain('const clearedEverything = view.totalOwed === 0 && owedToPeople === 0;');
  });
});
