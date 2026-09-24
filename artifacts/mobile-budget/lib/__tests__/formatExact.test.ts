import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatExact } from '@/lib/formatExact';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// Reported as: "can the banks show actual everywhere instead of rounding off".
describe('formatExact', () => {
  it('keeps whole shillings whole and cents as cents', () => {
    expect(formatExact(60778)).toBe('60,778');
    expect(formatExact(59020.9)).toBe('59,020.90');
    expect(formatExact(0.5)).toBe('0.50');
    expect(formatExact(-3225.94)).toBe('-3,225.94');
  });

  it('does not round a bank charge to nothing', () => {
    expect(formatExact(0.5)).not.toBe('1');
    expect(formatExact(0.4)).not.toBe('0');
  });
});

describe('bank figures on the phone are not rounded', () => {
  it('the Bank tab formatter uses it', () => {
    const bank = read('app/(tabs)/bank.tsx');
    expect(bank).toContain('return formatExact(n);');
    expect(bank).not.toMatch(/function formatKES[\s\S]{0,140}maximumFractionDigits: 0/);
  });

  it('the Home bank card uses it for the balance and the month\'s movements', () => {
    const home = read('app/(tabs)/index.tsx');
    expect(home).toContain('formatExact(bankAccount.balance)');
    expect(home).toContain('formatExact(monthlyDeposited)');
    expect(home).toContain('formatExact(monthlyDisbursed)');
  });

  it('Activity rows show the exact amount', () => {
    expect(read('components/ActivityCard.tsx')).toContain('{formatExact(item.amount)}');
  });
});
