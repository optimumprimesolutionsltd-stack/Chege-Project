import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bankGapLines } from '../bankMpesaGap';

const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8').replace(/\r\n/g, '\n');
const missing = { count: 2, from: '2026-10-14', to: '2026-10-15', receipts: ['TESTA1', 'TESTB2'] };

// "the mpesa balance is perfect, but i cant see latest payment yet its balanced?" (15 Oct 2026)
describe("Bank's line under M-Pesa's own balance", () => {
  it('says how many new messages are waiting and opens the review list', () => {
    expect(bankGapLines({ newSmsCount: 1, left: null, gap: -350 })).toEqual([
      { kind: 'new-sms', testID: 'bank-new-sms', title: '1 new M-Pesa message', href: '/mpesa-import?fromSms=new' },
    ]);
  });

  it('says how many payments Find the difference found missing, opening only those', () => {
    const [line] = bankGapLines({ newSmsCount: 0, left: { extra: 0, missing }, gap: -500 });
    expect(line.title).toBe('2 M-Pesa payments not in Jamvi yet');
    expect(line.href).toBe('/mpesa-import?smsFrom=2026-10-14&smsTo=2026-10-15&missing=1');
  });

  it('offers Find the difference for a gap nothing else explains', () => {
    expect(bankGapLines({ newSmsCount: 0, left: null, gap: 120 }).map((line) => line.href)).toEqual(['/mpesa-difference']);
  });

  it('says nothing when Jamvi and M-Pesa agree and nothing is waiting', () => {
    expect(bankGapLines({ newSmsCount: 0, left: { extra: 0, missing: null }, gap: 0 })).toEqual([]);
  });

  it('is shown under Balance now and never saves - each line only opens the review', () => {
    expect(bank).toMatch(/bankGapLines\(\{ newSmsCount, left: reconcileLeft, gap: balanceShift \}\)/);
    expect(bank).toContain('router.push(line.href as never)');
    expect(bank).not.toMatch(/notSure=1/);
  });
});
