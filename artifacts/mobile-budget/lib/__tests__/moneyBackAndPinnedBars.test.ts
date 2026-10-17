import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const bank = read('app/(tabs)/bank.tsx');

// "i have gone with friends out and paid the whole bill, later on i get refund
// from them to reduce that expense ... money in should have category logic too"
// (17 Oct 2026).
describe('Money back for a category', () => {
  it('is a kind of money in, offered on new entries', () => {
    expect(bank).toContain('testID="bank-deposit-money-back"');
    expect(bank).toContain('MONEY BACK FOR A CATEGORY');
    expect(bank).toContain("setMoneyBackFor('')");
  });

  it('asks which category it comes off', () => {
    expect(bank).toContain('testID="bank-money-back-category"');
    expect(bank).toContain('WHICH CATEGORY DOES IT COME OFF?');
    expect(bank).toContain('testID="money-back-category-search"');
  });

  it('is not income', () => {
    expect(bank).toContain('const notIncome = isBorrowing || repayingParty !== null || moneyBackFor !== null;');
  });

  it('saves as a refund in that category, so its spending falls', () => {
    const branch = bank.slice(bank.indexOf("} else if (txType === 'deposit' && moneyBackFor !== null) {"), bank.indexOf("} else if (txType === 'deposit') {"));
    expect(branch).toContain('createDisbursement(');
    expect(branch).toContain('expenseCategory: moneyBackFor');
    expect(branch).toContain('...REFUND');
    expect(branch).toContain("Alert.alert('Choose the category'");
    expect(bank).toContain('const REFUND = { isRefund: true } as const;');
  });

  it('is cleared when another kind is chosen and between postings', () => {
    expect(bank).not.toMatch(/[^;] setShowRepayPicker\(false\);/);
    expect(bank).toMatch(/setDepositorAmounts\(\{\}\);\r?\n\s*setMoneyBackFor\(null\);/);
  });
});

// "freeze this part" - the period chips, Transactions row and search on Money (17 Oct 2026).
describe('pinned controls', () => {
  it('Money pins its period, Transactions and search as the first list row', () => {
    expect(bank).toContain('stickyHeaderIndices={transactions.length > 0 ? [1] : undefined}');
    const row = bank.slice(bank.indexOf('if (item.id === BANK_CONTROLS_ROW.id) {'), bank.indexOf("const dep = item.type === 'deposit';"));
    expect(row).toContain('<BankPeriodBar');
    expect(row).toContain('TRANSACTIONS');
    expect(row).toContain('testID="bank-search-input"');
    expect(row).not.toContain('autoFocus');
  });

  it.each([
    ['app/income-ledger.tsx', 'income-ledger-month-bar', 'income-ledger-search'],
    ['app/expense-ledger.tsx', 'expense-ledger-month-bar', 'expense-ledger-search'],
    ['app/spending-by-item.tsx', 'spending-by-item-search-bar', 'spending-by-item-search'],
  ])('%s keeps its find box above the scroll', (file, bar, search) => {
    const src = read(file);
    const barAt = src.indexOf(`testID="${bar}"`);
    const searchAt = src.indexOf(`testID="${search}"`);
    const scrollAt = src.indexOf('<ScrollerScrollView');
    expect(barAt).toBeGreaterThan(-1);
    expect(searchAt).toBeGreaterThan(barAt);
    expect(searchAt).toBeLessThan(scrollAt);
  });
});
