import { describe, expect, it } from 'vitest';
import { differenceMessages, movedInMessage } from '@/lib/mpesaLiveBalance';

// "i have 6840" (12 Oct 2026): Find the difference read the step between two balances,
// which held a Fuliza repayment no message was sent for, and said Tiana was 9,882.
describe('what a message itself says it moved', () => {
  it('a payment: its amount and charge, out', () => {
    const body = 'UCGF99HV23 Confirmed. Ksh6,840.00 sent to TIANA for account 42 on 16/3/26 at 10:48 AM New M-PESA balance is Ksh117.62. Transaction cost, Ksh42.00.';
    expect(movedInMessage(body)).toBe(-6882);
  });

  it('money received: its amount, in', () => {
    expect(movedInMessage('UE5F937HJL Confirmed.You have received Ksh544.00 from BE ENERGY LTD on 6/5/26 at 9:39 AM New M-PESA balance is Ksh3,378.66.')).toBe(544);
  });

  it('nothing when the wording does not say which way', () => {
    expect(movedInMessage('Your M-PESA balance is Ksh100.00')).toBeUndefined();
  });

  it('is sent with each message', () => {
    const [message] = differenceMessages([{ body: 'UCGF99HV23 Confirmed. Ksh6,840.00 sent to TIANA for account 42 New M-PESA balance is Ksh117.62. Transaction cost, Ksh42.00.', date: Date.UTC(2026, 2, 16, 7, 48) }]);
    expect(message.moved).toBe(-6882);
  });
});
