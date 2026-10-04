import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { differenceMessages, kenyaDay, receiptOf, spanChangeText, startingBalanceAdvice } from '../mpesaLiveBalance';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const PAID = 'TJ4AB1CD2E Confirmed. Ksh3,000.00 paid to SAMPLE SUPERMARKET. on 13/7/26 at 1:37 PM.New M-PESA balance is Ksh206.52. Transaction cost, Ksh0.00.';
const FULIZA = 'Fuliza M-Pesa amount is Ksh 500.00. Interest charged Ksh 5.00. Total Fuliza M-Pesa outstanding amount is Ksh 505.00.';

describe('Find the difference, on the phone', () => {
  it('takes the receipt code a message starts with, and nothing that only looks like one', () => {
    expect(receiptOf(PAID)).toBe('TJ4AB1CD2E');
    expect(receiptOf(FULIZA)).toBeNull();
    expect(receiptOf('CONFIRMED Ksh 10')).toBeNull();
  });

  it('dates a message by its day in Kenya, as Jamvi dates entries', () => {
    // 22:30 UTC on 3 Oct is 01:30 on 4 Oct in Nairobi.
    expect(kenyaDay(Date.UTC(2026, 9, 3, 22, 30))).toBe('2026-10-04');
    expect(kenyaDay(Date.UTC(2026, 9, 3, 20, 59))).toBe('2026-10-03');
  });

  it('sends only the code, the balance and the time of messages that state a balance - never the message', () => {
    const sent = differenceMessages([{ body: PAID, date: Date.UTC(2026, 6, 13, 10, 37) }, { body: FULIZA, date: 1 }]);
    expect(sent).toEqual([{ receipt: 'TJ4AB1CD2E', balance: 206.52, at: Date.UTC(2026, 6, 13, 10, 37), day: '2026-07-13' }]);
    expect(Object.keys(sent[0]).sort()).toEqual(['at', 'balance', 'day', 'receipt']);
  });

  it('says which way each day moved', () => {
    expect(spanChangeText(2000)).toBe('Jamvi fell KES 2,000 further below M-Pesa');
    expect(spanChangeText(-500)).toBe('Jamvi went KES 500 further above M-Pesa');
  });

  it('turns a gap on the first day into the opening balance that closes it', () => {
    expect(startingBalanceAdvice(0.4, 0, 'Chege Mpesa', '1 Jan 2026')).toBeNull();
    expect(startingBalanceAdvice(1500, 0, 'Chege Mpesa', '1 Jan 2026')).toBe(
      'On 1 Jan 2026, when your messages begin, Jamvi was already KES 1,500 below M-Pesa. That is what Chege Mpesa held before Jamvi’s records start: set its opening balance to KES 1,500 in Bank.'.replace('’', "'"),
    );
    expect(startingBalanceAdvice(-800, 300, 'Chege Mpesa', '1 Jan 2026')).toContain('counted twice or saved to Chege Mpesa by mistake');
  });

  it('is opened from the Home card when Jamvi and M-Pesa disagree, and nothing on it changes anything by itself', () => {
    const card = read('components/MpesaImportCard.tsx');
    expect(card).toContain('{comparison && !comparison.agrees ? (');
    expect(card).toContain("router.push('/mpesa-difference' as never)");
    expect(card).not.toContain('Match M-Pesa');
    const screen = read('app/mpesa-difference.tsx');
    expect(screen).toContain("customFetch<Answer>('/api/mpesa/difference', {");
    expect(screen).toContain('body: JSON.stringify({ messages }),');
    expect(screen).not.toMatch(/method: 'PATCH'|method: 'DELETE'/);
    expect(read('app/_layout.tsx')).toContain('<Stack.Screen name="mpesa-difference" options={{ headerShown: false }} />');
  });

  it('can open the import on just the days that parted', () => {
    expect(read('app/mpesa-difference.tsx')).toContain('router.push(`/mpesa-import?smsFrom=${span.from}&smsTo=${span.to}` as never)');
    const importScreen = read('app/mpesa-import.tsx');
    expect(importScreen).toContain('const params = useLocalSearchParams<{ fromSms?: string; smsFrom?: string; smsTo?: string }>();');
    expect(importScreen).toContain('void readMpesaSms(params.smsFrom, params.smsTo).then((result) => {');
  });
});
