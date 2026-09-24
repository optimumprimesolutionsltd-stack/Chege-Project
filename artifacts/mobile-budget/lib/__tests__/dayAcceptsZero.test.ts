import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readAmount } from '@/lib/bankAmount';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// Reported as: "web app should accept zero". The Bank form already took a zero
// posting; the day of banking refused any line that was not above zero.
describe('a day of banking takes a zero line', () => {
  it('reads zero as an amount and a blank as no amount', () => {
    expect(readAmount('0')).toBe(0);
    expect(readAmount('0.00')).toBe(0);
    expect(readAmount('')).toBeNull();
    expect(readAmount('   ')).toBeNull();
  });

  it('counts a zero line as ready and does not call it a problem, on the phone', () => {
    const day = read('app/bank-day.tsx');
    expect(day).toContain('return amount !== null && amount >= 0;');
    expect(day).toContain('if (amount === null || amount < 0) return');
    expect(day).not.toContain('amount <= 0) return');
  });

  it('does the same on the web', () => {
    const day = read('../family-budget/src/pages/bank-day.tsx');
    expect(day).toContain('return amount !== null && amount >= 0;');
    expect(day).toContain('if (amount === null || amount < 0) return');
  });
});
