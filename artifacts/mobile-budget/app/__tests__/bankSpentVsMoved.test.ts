import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');

// "Withdrawn" counted spending, savings transfers and moves between your own
// accounts as one figure. The balance falls the same way for all three, but
// only the first is money consumed — so a day of transfers read exactly like a
// day of spending, and a budget built on that figure is wrong by whatever was
// merely moved.
describe('the account separates what was spent from what was moved', () => {
  it('classifies by where the money went, not by the balance falling', () => {
    expect(bank).toContain("if (tx.type !== 'disbursement') continue;");
    expect(bank).toContain('tx.bankTransferId != null || tx.savingsGoalId != null');
  });

  it('counts a savings transfer and a bank-to-bank move as moved, not spent', () => {
    // Still yours, in another pot.
    expect(bank).toContain('moved += tx.amount;');
    expect(bank).toContain('Still yours, in another pot.');
  });

  it('names bank charges apart from both', () => {
    // A fee is genuinely gone, but the app reports it apart from household
    // spending, so folding it into either would misstate one of them.
    expect(bank).toContain('charges += tx.amount;');
    expect(bank).toContain('testID="bank-stat-charges"');
  });

  it('shows spending under its own label', () => {
    expect(bank).toContain('testID="bank-stat-spent"');
    expect(bank).toContain('<Text style={styles.statLabel}>Spent</Text>');
    expect(bank).not.toContain('<Text style={styles.statLabel}>Withdrawn</Text>');
  });

  it('stays quiet about what does not apply', () => {
    // Most accounts have no transfers and no charges in a given period, and a
    // pair of zero lines every month is noise.
    expect(bank).toContain('{outgoing.moved > 0 ? (');
    expect(bank).toContain('{outgoing.charges > 0 ? (');
  });

  it('recomputes only when the transactions change', () => {
    expect(bank).toContain('}, [transactions]);');
  });
});
