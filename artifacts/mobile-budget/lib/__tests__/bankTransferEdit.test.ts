import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');

// Transfers between a person's own accounts showed no edit button at all.
describe('a transfer between accounts can be edited', () => {
  it('shows the edit button to whoever manages the account', () => {
    expect(bank).toMatch(/const canEditTransaction = \(tx: Tx\) =>\s*canManageAccount \|\| \(/);
  });

  it('corrects both halves through the transfer endpoint, with the accounts shown not offered', () => {
    expect(bank).toContain('`/api/joint-account/transfers/bank-to-bank/${editingTransfer.id}`');
    expect(bank).toContain('testID="bank-transfer-edit-summary"');
    expect(bank).toContain('{isBankTransfer && !editingTransfer && (');
  });

  it("offers \"This wasn't a transfer\", which becomes ordinary money out or in", () => {
    expect(bank).toContain('testID="bank-transfer-not-a-transfer"');
    expect(bank).toContain('`/api/joint-account/transfers/bank-to-bank/${editingTransfer.id}/unpair`');
    expect(bank).toContain('testID="bank-transfer-unpair-note"');
  });
});
