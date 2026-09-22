import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/bank-day.tsx', 'utf8');

// Listing every account as its own row, all visible at once with only a
// border colour telling them apart, read as "these are all in play" rather
// than "pick one" once there was more than one account.
describe('the day-statement account picker shows one account at a time', () => {
  it('uses the shared picker instead of listing every account as its own row', () => {
    expect(source).toContain('<BankAccountPicker');
    expect(source).toContain('testIDPrefix="bank-day-account"');
    expect(source).not.toContain('accounts.map((candidate) =>');
  });
});
