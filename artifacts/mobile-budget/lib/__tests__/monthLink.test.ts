import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { linkedDay, monthLedgerHref } from '@/lib/monthLink';

// "Can these tabs be clickable" (8 Oct 2026): a Reports trend bar opens its month.
describe('a trend bar opens its month', () => {
  it('links a whole calendar month', () => {
    expect(monthLedgerHref('/expense-ledger', 2026, 8)).toBe('/expense-ledger?from=2026-08-01&to=2026-08-31');
    expect(monthLedgerHref('/income-ledger', 2024, 2)).toBe('/income-ledger?from=2024-02-01&to=2024-02-29');
  });

  it('the ledgers start on the days they were handed, and ignore anything else', () => {
    expect(linkedDay('2026-08-01')).toBe('2026-08-01');
    expect(linkedDay('Aug')).toBeNull();
    expect(linkedDay(undefined)).toBeNull();
    for (const screen of ['app/expense-ledger.tsx', 'app/income-ledger.tsx']) {
      expect(readFileSync(screen, 'utf8')).toContain('useState<string>(() => linkedDay(linked.from) ?? monthStartIso())');
    }
  });

  it('both trends are tappable', () => {
    expect(readFileSync('components/SpendingTrendCard.tsx', 'utf8')).toContain("router.push(monthLedgerHref('/expense-ledger', month.year, month.month) as never)");
    expect(readFileSync('app/(tabs)/reports.tsx', 'utf8')).toContain("router.push(monthLedgerHref('/income-ledger', monthLabel.year, monthLabel.month) as never)");
  });
});
