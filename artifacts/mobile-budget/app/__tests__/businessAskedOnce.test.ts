import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// "When I choose business income, the income streams should not be there ...
// also, why do I need to choose this is for my business" (9 Oct 2026): once
// Who is this for? names a business, nothing asks it again.
const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
const phoneImport = readFileSync('app/mpesa-import.tsx', 'utf8');
const webImport = readFileSync('../family-budget/src/pages/mpesa-import.tsx', 'utf8');

describe('a business chosen is not asked for again', () => {
  it('Bank: no income streams to pick from, and no "This is my business\'s money"', () => {
    expect(bank).toContain('{isDeposit && !notIncome && forBusinessId === null && (singleDepositorId || depositorIds.length === 0) && (');
    expect(bank).toContain("(txType === 'deposit' || txType === 'disbursement') && (editingBusinessMoney || forBusinessId === null) ? (");
  });

  it('Bank: back to Personal takes the business off as the source', () => {
    expect(bank).toContain("if (txType === 'deposit' && incomeSourceId !== null && whoForBusinesses.some((one) => one.id === incomeSourceId)) setIncomeSourceId(null);");
  });

  it('Import, phone and web: no "Where did this come from?" on a business line', () => {
    expect(phoneImport).toContain("item.type !== 'reversal' && businessFor(item) === null ? (");
    expect(webImport).toContain('incomeSources.length > 0 && businessFor(item) === null ? (');
  });
});
