import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isRefund, spentText } from '@/lib/refundLabel';

// A refund is a negative payment (api-server lib/refunds): lists read "Refund +300", not "−-300".
describe('refunds in spending lists', () => {
  it('reads as money back', () => {
    expect(isRefund(-300)).toBe(true);
    expect(isRefund('1200')).toBe(false);
    expect(spentText(-300)).toBe('Refund +300');
    expect(spentText(1_200)).toBe('1,200');
    expect(spentText(-2_000, 'KES ')).toBe('Refund +KES 2,000');
  });

  it('on Activity, All expenses, a category ledger, Sort them out and the Activity feed', () => {
    for (const file of ['app/(tabs)/history.tsx', 'app/expense-ledger.tsx', 'app/(tabs)/budget.tsx', 'app/sort-entries.tsx', 'components/ActivityCard.tsx']) {
      expect(readFileSync(file, 'utf8')).toContain("from '@/lib/refundLabel';");
    }
  });
});
