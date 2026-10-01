import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mpesaNameFor } from '@/lib/mpesaNames';

// "Can Jamvi also search for words from M-Pesa, e.g. naivas?"
describe("keeping M-Pesa's own name for an entry saved under a nickname", () => {
  it('keeps it when the entry was renamed', () => {
    expect(mpesaNameFor(5, 'NAIVAS LTD', 'Supermarket')).toEqual({ transactionId: 5, name: 'NAIVAS LTD' });
  });

  it('has nothing to keep when the saved name is already M-Pesa’s', () => {
    expect(mpesaNameFor(5, 'Naivas Ltd', 'NAIVAS LTD')).toBeNull();
    expect(mpesaNameFor(5, undefined, 'Naivas')).toBeNull();
    expect(mpesaNameFor(undefined, 'NAIVAS', 'Supermarket')).toBeNull();
  });

  it('is sent after the import saves', () => {
    const screen = readFileSync('app/mpesa-import.tsx', 'utf8');
    expect(screen).toContain('const named = mpesaNameFor(posted.id, item.original, item.description);');
    expect(screen).toContain('void saveMpesaNames(mpesaNames);');
  });
});
