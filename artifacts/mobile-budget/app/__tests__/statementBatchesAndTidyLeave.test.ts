import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(__dirname, '..', '..', '..', path), 'utf8');

// A year's statement has thousands of receipts; the server takes 2,000 a request.
describe('receipt codes in batches', () => {
  it('checks and recategorises in batches on the phone and the web', () => {
    for (const path of ['mobile-budget/app/mpesa-import.tsx', 'family-budget/src/pages/mpesa-import.tsx']) {
      const screen = read(path);
      expect(screen).toContain('const RECEIPT_BATCH = 1_000;');
      expect(screen).toContain('codes.slice(start, start + RECEIPT_BATCH)');
      expect(screen).toContain('pendingChanges.slice(start, start + RECEIPT_BATCH)');
    }
  });
});

// "Tidy imported entries?" kept offering to move a payment the person had moved out.
describe('tidy imported entries', () => {
  it('can leave entries as they are, remembered, and tidies only what was shown', () => {
    const bank = read('mobile-budget/app/(tabs)/bank.tsx');
    expect(bank).toContain("text: 'Leave as they are'");
    expect(bank).toContain('`jamvi:tidy-left:${tidyAccountId}`');
    expect(bank).toContain('{ accountId: tidyAccountId, ids: shownIds }');
    expect(bank).toContain("await customFetch('/api/joint-account/import-tidy/keep', {");
  });

  it('names each entry on the server and limits a tidy to the ids given', () => {
    const route = read('api-server/src/routes/joint-account.ts');
    expect(route).toContain('chargeRows: charges.map((row) => ({ id: Number(row.id), amount: Number(row.amount), description: row.description ?? "", date: String(row.date).slice(0, 10) })),');
    expect(route).toContain('const charges = only ? found.charges.filter((row) => only.has(Number(row.id))) : found.charges;');
  });
});
