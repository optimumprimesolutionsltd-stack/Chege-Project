import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// "When opening a bank account, one should be asked if it's for business or
// personal" - kept out of personal (8 Oct 2026).
describe('business or personal, for every account', () => {
  const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');

  it('is asked in the account sheet, and a new account cannot be saved without an answer', () => {
    expect(bank).toContain('testID={`bank-account-purpose-${option.business ? \'business\' : \'personal\'}`}');
    expect(bank).toContain("Alert.alert('Business or personal?'");
    expect(bank).toContain('setAccountIsBusiness(account ? businessAccounts.businessIds.has(account.id) : null);');
  });

  it('is saved on the server after the account, and shown on the account chip', () => {
    expect(bank).toContain('await businessAccounts.setBusiness(account.id, accountIsBusiness)');
    expect(bank).toContain('testID={`bank-account-business-${account.id}`}');
  });

  it('the Business report lists each business account; the income list says what was left out', () => {
    expect(readFileSync('app/business.tsx', 'utf8')).toContain('testID={`business-account-${account.accountId}`}');
    const income = readFileSync('app/income-ledger.tsx', 'utf8');
    expect(income).toContain('from your business');
    expect(income).toContain('into business accounts');
  });
});
