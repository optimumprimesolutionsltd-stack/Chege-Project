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
    const sent = differenceMessages([{ body: PAID, date: Date.UTC(2026, 6, 13, 10, 37) }, { body: 'Thank you for using M-PESA', date: 1 }]);
    expect(sent).toEqual([{ receipt: 'TJ4AB1CD2E', balance: 206.52, at: Date.UTC(2026, 6, 13, 10, 37), day: '2026-07-13' }]);
    expect(Object.keys(sent[0]).sort()).toEqual(['at', 'balance', 'day', 'receipt']);
  });

  // Fix all once brought in Fuliza repayments, which the import never saves,
  // and saved nothing (5 Oct 2026).
  it('counts the Fuliza still owed, and marks the loan messages as nothing to bring in', () => {
    const at = (h: number) => Date.UTC(2026, 6, 13, h);
    const sent = differenceMessages([
      { body: 'TJ5PAY0001 Confirmed. Ksh500.00 paid to SAMPLE SHOP. on 13/7/26 at 1:00 PM.New M-PESA balance is Ksh0.00. Transaction cost, Ksh0.00.', date: at(10) },
      { body: 'TJ5PAY0001 Confirmed. Fuliza M-PESA amount is Ksh 500.00. Access Fee charged Ksh 5.00. Total Fuliza M-PESA outstanding amount is Ksh 505.00 due on 12/8/26.', date: at(10) + 1000 },
      { body: 'TJ5GOT0002 Confirmed. You have received Ksh1,000.00 from JANE DOE on 13/7/26 at 3:00 PM New M-PESA balance is Ksh1,000.00.', date: at(12) },
      { body: 'TJ5FUL0003 Confirmed. Ksh 300.00 from your M-PESA has been used to partially pay your outstanding Fuliza M-PESA. Available Fuliza M-PESA limit is Ksh 2,000.00. M-PESA balance is Ksh 700.00.', date: at(12) + 1000 },
      { body: 'TJ5FUL0004 Confirmed. Ksh 205.00 from your M-PESA has been used to fully pay your outstanding Fuliza M-PESA. Available Fuliza M-PESA limit is Ksh 2,000.00. M-PESA balance is Ksh 495.00.', date: at(13) },
    ]);
    expect(sent.map((message) => [message.receipt, message.balance, message.record])).toEqual([
      ['TJ5PAY0001', 0, undefined],
      // The payment is saved in full and the fee as a charge: Jamvi is 505 below nothing.
      ['TJ5PAY0001', -505, false],
      ['TJ5GOT0002', 495, undefined],
      ['TJ5FUL0003', 495, false],
      ['TJ5FUL0004', 495, false],
    ]);
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

  it('runs by itself from Home now; the screen opens from Waiting for you for what is left (10 Oct 2026)', () => {
    const card = read('components/MpesaImportCard.tsx');
    // No button, and no "Jamvi is below M-Pesa" line: a difference fixes itself (lib/autoReconcile).
    expect(card).not.toContain('mpesa-home-card-find-difference');
    expect(card).toContain('{comparison?.agrees ? (');
    expect(card).not.toContain('Match M-Pesa');
    expect(read('app/(tabs)/index.tsx')).toContain("onPress: () => router.push('/mpesa-difference' as never),");
    const screen = read('app/mpesa-difference.tsx');
    expect(screen).toContain("customFetch<Answer>('/api/mpesa/difference', {");
    expect(screen).toContain('body: JSON.stringify({ messages }),');
    // Since 9 Oct 2026 it can set the starting balance and remove an entry - each
    // only from the Set it / Remove button of a confirmation, never by itself.
    for (const method of ["method: 'PATCH'", "method: 'DELETE'"]) {
      const at = screen.indexOf(method);
      expect(at).toBeGreaterThan(-1);
      const before = screen.slice(0, at);
      expect(before.lastIndexOf('Alert.alert(')).toBeGreaterThan(before.lastIndexOf('const '));
    }
    expect(read('app/_layout.tsx')).toContain('<Stack.Screen name="mpesa-difference" options={{ headerShown: false }} />');
  });

  it('can open the import on just the days that parted', () => {
    expect(read('app/mpesa-difference.tsx')).toContain('router.push(`/mpesa-import?smsFrom=${span.from}&smsTo=${span.to}` as never)');
    const importScreen = read('app/mpesa-import.tsx');
    expect(importScreen).toContain('const params = useLocalSearchParams<{ fromSms?: string; smsFrom?: string; smsTo?: string; notSure?: string }>();');
    expect(importScreen).toContain('void readMpesaSms(params.smsFrom, params.smsTo).then((result) => {');
  });
});

describe('when the check cannot reach the server', () => {
  it('says so in a sentence and never shows the host’s error page', async () => {
    const { differenceError } = await import('../differenceError');
    const page = Object.assign(new Error('HTTP 502 : <!DOCTYPE html><html lang="en"><head>'), { status: 502 });
    expect(differenceError(page)).toBe('Jamvi could not reach its server just then, so nothing was checked. Nothing was changed.');
    expect(differenceError(Object.assign(new Error('x'), { status: 400, data: { error: 'No M-Pesa messages with a balance were found.' } }))).toBe('No M-Pesa messages with a balance were found.');
    expect(differenceError(Object.assign(new Error('HTTP 418 : <html>'), { status: 418 }))).toBe('Could not check just then.');
  });
  it('tries again by itself through a hiccup: the check only reads', () => {
    expect(read('app/mpesa-difference.tsx')).toContain("setAnswer(await retrySave(() => customFetch<Answer>('/api/mpesa/difference', {");
  });
});

describe('after days are brought in or fixed', () => {
  // "Once the days have been brought in and sorted, Jamvi should clear that
  // tab, which it's not doing" (4 Oct 2026): it checked once, on opening.
  const screen = read('app/mpesa-difference.tsx');
  it('checks again each time the screen is shown, so sorted days drop off the list', () => {
    expect(screen).toMatch(/useFocusEffect\(useCallback\(\(\) => \{\s+void check\(\);/);
    expect(screen).not.toContain('useEffect(() => { void check(); }, [check]);');
  });
  it('keeps the last result on screen while it checks again', () => {
    expect(screen).toContain("if (shownRef.current) setRechecking(true);\n    else setState('reading');");
    expect(screen).toContain('testID="mpesa-difference-rechecking"');
  });
});

describe('Fix all', () => {
  // "Can the user be asked to confirm all in one go and the app sorts it out
  // all at once" (4 Oct 2026).
  const span = (from: string, to: string, over: Partial<import('../mpesaLiveBalance').DifferenceSpan> = {}) =>
    ({ from, to, change: 100, missing: [], extra: [], redated: [], ...over });

  it('moves what was saved elsewhere, re-dates what was saved on another day, and brings in the rest over the days they span', async () => {
    const { fixPlan, hasFixes } = await import('../mpesaLiveBalance');
    const plan = fixPlan([
      span('2026-03-02', '2026-03-02', { missing: [{ receipt: 'AAA0000001', day: '2026-03-02', savedIn: 'Equity', savedOn: '2026-03-02' }] }),
      span('2026-05-10', '2026-05-12', {
        missing: [{ receipt: 'AAA0000002', day: '2026-05-11', savedIn: null, savedOn: null }],
        redated: [{ id: 7, receipt: 'AAA0000003', messageDay: '2026-05-12', savedDate: '2026-05-13', amount: -50, description: 'x' }],
      }),
      span('2026-08-01', '2026-08-01', {
        missing: [{ receipt: 'AAA0000004', day: '2026-08-01', savedIn: null, savedOn: null }],
        extra: [{ id: 9, date: '2026-08-01', amount: -500, description: 'Rent (typed)', receipt: null }],
      }),
    ]);
    expect(plan).toEqual({
      move: ['AAA0000001'],
      redate: [{ id: 7, date: '2026-05-12' }],
      bringIn: { count: 2, from: '2026-05-10', to: '2026-08-01' },
      leftToCheck: 1,
      charges: [],
    });
    expect(hasFixes(plan)).toBe(true);
    expect(hasFixes(fixPlan([span('2026-01-01', '2026-01-01', { extra: [{ id: 1, date: '2026-01-01', amount: -1, description: 'x', receipt: null }] })]))).toBe(false);
  });

  // "No single entry explains this" was nearly always a charge never saved (5 Oct 2026).
  // Worked out from the balance alone, Fix all once added 137 "charges" of up
  // to KES 3,829 where messages were not on the phone (5 Oct 2026). Now only
  // the charge the message itself states, and only when that is the shortfall.
  it('adds only the charge a message states, and only when that is what Jamvi is short', async () => {
    const { fixPlan, hasFixes, missingCharge, statedCharge } = await import('../mpesaLiveBalance');
    expect(statedCharge('TJ1 Confirmed. Ksh500.00 sent to JANE. New M-PESA balance is Ksh1,000.00. Transaction cost, Ksh7.00.')).toBe(7);
    expect(statedCharge('TJ1 Confirmed. Ksh500.00 paid to SHOP. Transaction cost, Ksh0.00.')).toBe(0);
    expect(statedCharge('TJ1 Confirmed. You have received Ksh500.00')).toBeNull();
    expect(missingCharge({ inMessages: -107, inJamvi: -100 }, 7)).toBe(7);
    // The balance says 3,829 short, but the message states no such charge.
    expect(missingCharge({ inMessages: -3929.51, inJamvi: -100 }, 7)).toBeNull();
    expect(missingCharge({ inMessages: -107, inJamvi: -100 }, null)).toBeNull();
    expect(missingCharge({ inMessages: -100, inJamvi: -100 }, 0)).toBeNull();
    const plan = fixPlan([span('2026-09-13', '2026-09-13', { amounts: [
      { receipt: 'TJ1', day: '2026-09-13', entryId: 4, description: 'Shop', inMessages: -57, inJamvi: -50 },
      { receipt: 'TJ2', day: '2026-09-13', entryId: 5, description: 'Airtime', inMessages: -3929.51, inJamvi: -100 },
    ] })], (receipt) => (receipt === 'TJ1' ? 7 : receipt === 'TJ2' ? 0 : null));
    expect(plan.charges).toEqual([{ entryId: 4, amount: 7 }]);
    expect(plan.leftToCheck).toBe(1);
    expect(hasFixes(plan)).toBe(true);
    const screen = read('app/mpesa-difference.tsx');
    expect(screen).toContain('const plan = fixPlan(answer.result.spans, chargeOf);');
    expect(screen).toContain("{rechecking ? 'Checking…' : 'Check again'}");
  });

  it('says in one confirmation what changes, and that nothing is deleted', async () => {
    const { fixConfirmation } = await import('../mpesaLiveBalance');
    const { title, message } = fixConfirmation({ move: ['A'], redate: [{ id: 1, date: '2026-01-01' }], bringIn: { count: 12, from: '2026-01-01', to: '2026-02-01' }, leftToCheck: 3, charges: [{ entryId: 9, amount: 7 }, { entryId: 10, amount: 13 }] }, 'Chege Mpesa');
    expect(title).toBe('Fix all of these?');
    expect(message).toContain('Bring in 12 payments not saved anywhere, as Not sure yet');
    expect(message).toContain('Move 1 saved in another account to Chege Mpesa.');
    expect(message).toContain('Give 1 entry the day of its M-Pesa message.');
    expect(message).toContain('Add 2 M-Pesa charges M-Pesa took but Jamvi never saved (KES 20 in all), each to its payment.');
    expect(message).toContain('Nothing is deleted. 3 entries in Chege Mpesa that are in none of your messages stay for you to look at');
  });

  it('asks first, fixes on the server, then brings the missing days in under Not sure yet and saves them', () => {
    const screen = read('app/mpesa-difference.tsx');
    expect(screen.indexOf('Alert.alert(title, message, [')).toBeLessThan(screen.indexOf("'/api/mpesa/difference/fix'"));
    expect(screen).toContain('router.push(`/mpesa-import?smsFrom=${plan.bringIn.from}&smsTo=${plan.bringIn.to}&notSure=1` as never);');
    const importScreen = read('app/mpesa-import.tsx');
    expect(importScreen).toContain("setChoices((current) => putUnderNotSure(notSureableLines(shown, current), current));");
    expect(importScreen).toContain('if (firstProblem) {\n      Alert.alert(\'Almost there\', `${firstProblem} Then tap Save.`);');
  });
});

describe('2026 only', () => {
  // "I want to work with 2026 only" (4 Oct 2026).
  it('works from 1 January of this year, by Kenya’s calendar, and drops anything earlier', async () => {
    const { workingYear, inWorkingYear } = await import('../mpesaLiveBalance');
    const now = Date.UTC(2026, 9, 4, 12);
    const year = workingYear(now);
    expect(year.year).toBe(2026);
    expect(year.from).toBe('2026-01-01');
    expect(year.days).toBeGreaterThanOrEqual(277);
    const rows = [
      { body: 'a', date: Date.UTC(2025, 11, 31, 20, 59) }, // 23:59 on 31 Dec in Nairobi
      { body: 'b', date: Date.UTC(2025, 11, 31, 21, 0) },  // 00:00 on 1 Jan in Nairobi
    ];
    expect(inWorkingYear(rows, year.from).map((row) => row.body)).toEqual(['b']);
  });
  it('is what Find the difference reads', () => {
    // Money in with no source is no longer 2026 only: every year is gathered for
    // Sort them out ("fix old entries too", 7 Oct 2026; moneyInSource.test).
    const screen = read('app/mpesa-difference.tsx');
    expect(screen).toContain('const rows = inWorkingYear(read.rows, yearFrom);');
  });
});
