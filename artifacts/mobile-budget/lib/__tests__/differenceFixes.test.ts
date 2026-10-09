import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { openingBalanceFix, startingBalanceAdvice } from '@/lib/mpesaLiveBalance';

// "It shows a difference, but it does not tell me a way of resolving it or ask
// if it can resolve it on my behalf" (9 Oct 2026).
describe('the starting balance, set in one tap', () => {
  it('is the opening balance that starts Jamvi level with M-Pesa', () => {
    // Jamvi 2,500 below M-Pesa on the first day, with 1,000 already as the opening.
    expect(openingBalanceFix(2_500, 1_000)).toBe(3_500);
    // The advice names the same figure.
    expect(startingBalanceAdvice(2_500, 1_000, 'M-Pesa', '1 Jan 2026')).toContain('KES 3,500');
  });

  it('is not offered with no gap, or when Jamvi was already above M-Pesa', () => {
    expect(openingBalanceFix(0.4, 1_000)).toBeNull();
    // 300 above with nothing as the opening: something was counted twice - no opening balance fixes that.
    expect(openingBalanceFix(-300, 0)).toBeNull();
    // Above, but there is opening to take it from: a smaller opening balance.
    expect(openingBalanceFix(-300, 1_000)).toBe(700);
  });
});

describe('the screen offers each fix', () => {
  const screen = readFileSync('app/mpesa-difference.tsx', 'utf8');
  it('sets the starting balance after asking, dated the day before the messages begin', () => {
    expect(screen).toContain('testID="mpesa-difference-set-opening"');
    expect(screen).toContain("customFetch('/api/joint-account/opening-balance', {");
    expect(screen).toContain('openingBalanceDate: dayBefore(checked.from)');
  });

  it('an entry no message has can be opened on Bank, or removed after asking', () => {
    expect(screen).toContain('testID={`mpesa-difference-open-${item.id}`}');
    expect(screen).toContain('testID={`mpesa-difference-remove-${item.id}`}');
    expect(screen).toContain("customFetch(`/api/joint-account/${item.id}`, { method: 'DELETE' })");
    expect(screen).toContain("returnTo=${encodeURIComponent('/mpesa-difference')}");
  });

  it('checks again after each fix, so what is sorted drops off the list', () => {
    expect(screen).toContain('await retrySave(what);\n      await check();');
  });
});

describe('a save refused for a linked reversal offers to unlink (9 Oct 2026)', () => {
  const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
  it('asks, then unlinks and saves again, instead of "HTTP 409 ... Unlink it first"', () => {
    expect(bank).toContain('const linkedReversal = /linked to (?:the payment it reversed|its money back)/i.test(message);');
    expect(bank).toContain("text: 'Unlink and save',");
    expect(bank).toContain('await unlinkReversal({ id });\n                    await handleSubmit({ keepOpen });');
  });
});
