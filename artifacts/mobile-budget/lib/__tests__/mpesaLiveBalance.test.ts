import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { balanceComparison, balanceGap, balanceInMessage, latestBalance, messageTime } from '../mpesaLiveBalance';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// Real shapes of M-Pesa's messages (names and codes replaced).
const SENT = 'TESTSEND1 Confirmed. Ksh70.00 sent to SAMPLE PERSON 0700000000 on 2/9/26 at 9:50 AM. New M-PESA balance is Ksh1,250.40. Transaction cost, Ksh0.00.';
const PAID = 'TESTMERCHANT3 Confirmed. Ksh3,000.00 paid to SAMPLE SUPERMARKET. on 13/7/26 at 1:37 PM.New M-PESA balance is Ksh206.52. Transaction cost, Ksh0.00.';
const RECEIVED = 'TESTRECEIVE2 Confirmed.You have received Ksh3,500.00 from SAMPLE PERSON on 22/10/25 at 3:31 PM  New M-PESA balance is Ksh3,500.00. Earn interest daily';
const NO_BALANCE = 'Dear customer, your Fuliza M-PESA limit is Ksh 2,000. Dial *234# to check.';

describe('the M-Pesa balance a message states', () => {
  it('is read from every kind of M-Pesa message, with or without a space before it', () => {
    expect(balanceInMessage(SENT)).toBe(1250.4);
    expect(balanceInMessage(PAID)).toBe(206.52);
    expect(balanceInMessage(RECEIVED)).toBe(3500);
  });
  it('is nothing for a message that states no balance', () => {
    expect(balanceInMessage(NO_BALANCE)).toBeNull();
  });
});

describe('the live balance', () => {
  it('is the newest message that states one, whatever order they come in', () => {
    const rows = [
      { body: SENT, date: 300 },
      { body: PAID, date: 100 },
      { body: NO_BALANCE, date: 400 },
      { body: RECEIVED, date: 200 },
    ];
    expect(latestBalance(rows)).toEqual({ balance: 1250.4, at: 300 });
  });
  it('is nothing when no message states one', () => {
    expect(latestBalance([{ body: NO_BALANCE, date: 1 }])).toBeNull();
    expect(latestBalance([])).toBeNull();
  });
});

describe("Jamvi's figure beside it", () => {
  it('agrees to the shilling, or says how far apart and which way', () => {
    expect(balanceGap(1250.4, 1250)).toBeNull();
    expect(balanceGap(1250, -324188)).toBe(325438);
    expect(balanceGap(100, 500)).toBe(-400);
  });

  it('names what is probably missing (the owner’s case: KES -324,188 in Jamvi)', () => {
    const behind = balanceComparison(1250, -324188, 'Chege Mpesa');
    expect(behind.agrees).toBe(false);
    expect(behind.text).toBe('Chege Mpesa in Jamvi: KES -324,188, KES 325,438 less than M-Pesa. Some money in was not recorded in Chege Mpesa, or its opening balance is missing.');
    const ahead = balanceComparison(100, 500, null);
    expect(ahead.text).toContain('KES 400 more than M-Pesa. Some money out was not recorded in M-Pesa');
    expect(balanceComparison(1250, 1250, 'Chege Mpesa')).toEqual({ agrees: true, text: 'Jamvi agrees: Chege Mpesa is KES 1,250 in Jamvi too.' });
  });

  it('says when the message came', () => {
    expect(messageTime(new Date(2026, 9, 4, 15, 12).getTime())).toBe('4 Oct, 3:12 PM');
    expect(messageTime(new Date(2026, 9, 4, 0, 5).getTime())).toBe('4 Oct, 12:05 AM');
  });
});

describe('the Home M-Pesa card', () => {
  const card = read('components/MpesaImportCard.tsx');
  it('leads with the live balance when the phone can read it, and keeps Jamvi’s figure otherwise', () => {
    expect(card).toContain('testID="mpesa-home-card-live-balance"');
    expect(card).toContain('M-Pesa balance now');
    expect(card.indexOf('{live ? (')).toBeLessThan(card.indexOf('testID="mpesa-home-card-balance"'));
  });
  it('reads it again each time Home is shown', () => {
    expect(card).toContain('useFocusEffect(useCallback(() => { if (personal) void refetchLive(); }, [personal, refetchLive]));');
  });
  it('shows it only in a Personal budget: a group\u2019s account is not this person\u2019s M-Pesa', () => {
    expect(card).toContain('const personal = group?.isPrivate === true;');
    expect(card).toContain('enabled: personal,');
    expect(card).toContain('const live = personal ? liveRead ?? null : null;');
  });
  it('never asks for permission just to show it', () => {
    const sms = read('lib/mpesaSms.ts');
    const reader = sms.slice(sms.indexOf('export async function readLiveMpesaBalance'), sms.indexOf('export async function readLiveMpesaBalance') + 500);
    expect(reader).toContain('PermissionsAndroid.check(');
    expect(reader).not.toContain('PermissionsAndroid.request(');
  });
});
