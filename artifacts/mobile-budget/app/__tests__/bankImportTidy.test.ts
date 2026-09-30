import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');

describe('Bank: tidy imported entries', () => {
  it('shows what would change for this account, and asks before changing it', () => {
    expect(bank).toContain("queryFn: () => customFetch(`/api/joint-account/import-tidy?accountId=${tidyAccountId}`)");
    expect(bank).toContain("Alert.alert('Tidy imported entries?'");
    expect(bank).toContain('{canManageAccount && tidyCount > 0 && (');
  });
});
