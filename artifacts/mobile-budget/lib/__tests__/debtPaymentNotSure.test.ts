import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// "Made changes but still showing not sure yet" (8 Oct 2026): a payment changed
// to "Paying Optimum prime solutions Ltd" kept "Not sure yet" from before.
describe('a payment to somebody you owe drops Not sure yet', () => {
  const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
  const fix = readFileSync('../api-server/src/lib/borrowed-not-income.ts', 'utf8');

  it('changing to paying somebody you owe clears any category, and Not sure yet is never saved', () => {
    expect(bank).toContain("if (withdrawDest !== 'party') setExpenseCategory('');");
    expect(bank).toContain('isNotSure(expenseCategory) ||');
    expect(bank.match(/\? \{ expenseCategory: null \}|: debtPaymentHasNoCategory/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('a fee category is dropped from a debt payment too (40,000 stayed "M-Pesa charges")', () => {
    expect(bank).toContain('paymentFiledAsCharge ||');
    expect(bank).toContain("/^(m-pesa|fuliza) charges$/i.test(expenseCategory.trim())");
    expect(bank.match(/debtPaymentHasNoCategory/g)).toHaveLength(3);
    expect(fix).toContain(`lower(btrim(t."expense_category")) IN ('m-pesa charges', 'fuliza charges')`);
    expect(fix).toContain(`AND t."charge_for_transaction_id" IS NULL`);
  });

  it('entries already saved that way are put right at start', () => {
    expect(fix).toContain(`AND lower("expense_category") = 'not sure yet'`);
    expect(fix).toContain(`AND "settles_contributor_id" IS NOT NULL`);
  });
});
