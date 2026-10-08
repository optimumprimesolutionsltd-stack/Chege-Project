import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const screen = readFileSync('app/expense-ledger.tsx', 'utf8');
const route = readFileSync('../api-server/src/routes/dashboard.ts', 'utf8');

// "What happens if i see a wrong entry here? can i tap it and it takes me to
// where i can edit it" (8 Oct 2026).
describe('All expenses: a wrong entry opens to be corrected', () => {
  it('opens an M-Pesa or bank entry on Bank, on its own account', () => {
    expect(screen).toContain("? `/(tabs)/bank?editTx=${entry.id.replace('bank-disbursement-', '')}${accountId ? `&accountId=${accountId}` : ''}`");
    expect(route).toContain('accountId: disbursement.accountId ?? null,');
  });

  it('marks what can be opened, and offers Sort them out on Not sure yet', () => {
    expect(screen).toContain('{href ? <Feather name="edit-2"');
    expect(screen).toContain('testID="expense-ledger-sort-them-out"');
  });
});
