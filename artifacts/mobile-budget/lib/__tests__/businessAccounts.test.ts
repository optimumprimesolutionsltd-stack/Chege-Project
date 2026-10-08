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
    expect(bank).toContain('await businessAccounts.setBusiness(account.id, accountIsBusiness, businessId)');
    expect(bank).toContain("testID={group.label ? `bank-accounts-${group.business ? 'business' : 'personal'}` : 'bank-accounts-all'}");
  });

  it('the Business report lists each business account; the income list says what was left out', () => {
    expect(readFileSync('app/business.tsx', 'utf8')).toContain('testID={`business-account-${account.accountId}`}');
    const income = readFileSync('app/income-ledger.tsx', 'utf8');
    expect(income).toContain('from your business');
    expect(income).toContain('into business accounts');
  });
});

// "A user has many businesses, it's good to specify to which business the money
// is going" / "they look overcrowded" (8 Oct 2026).
describe('which business, and accounts grouped by it', () => {
  const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');

  it('asks which business for a business account, or takes a new one', () => {
    expect(bank).toContain('testID={`bank-account-business-of-${stream.id}`}');
    expect(bank).toContain('testID="bank-account-new-business"');
    expect(bank).toContain("await businessAccounts.setBusiness(account.id, accountIsBusiness, businessId)");
  });

  it('groups accounts: Personal, then one row per business', () => {
    expect(bank).toContain("{ label: 'Personal', business: false,");
    expect(bank).toContain("label: streamId === null ? 'Business' : incomeSourceNames.get(streamId) ?? 'Business',");
  });
});
