import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { onlyWanted, setBringIn, takeBringIn } from '../bringInReceipts';
import { fixPlan, type DifferenceSpan } from '../mpesaLiveBalance';

// "waiting for you does not open to anything despite all those messages" (11 Oct 2026):
// 755 missing payments read every message over most of a year.
describe('bringing in the missing payments reads only those', () => {
  it('carries the codes of the payments not saved anywhere', () => {
    const span = (missing: DifferenceSpan['missing']): DifferenceSpan => ({ from: '2026-03-01', to: '2026-03-02', change: 0, missing, extra: [], redated: [] });
    const plan = fixPlan([span([
      { receipt: 'TC1AAA0001', day: '2026-03-01', savedIn: null, savedOn: null },
      { receipt: 'TC2BBB0002', day: '2026-03-01', savedIn: 'Cash', savedOn: '2026-03-01' },
      { receipt: 'TC3CCC0003', day: '2026-03-02', savedIn: null, savedOn: null },
    ])]);
    expect(plan.bringIn).toEqual({ count: 2, from: '2026-03-01', to: '2026-03-02', receipts: ['TC1AAA0001', 'TC3CCC0003'] });
  });

  it('hands them over once, and keeps only their messages', () => {
    setBringIn(['TC1AAA0001']);
    const codes = takeBringIn();
    expect(takeBringIn()).toBeNull();
    const messages = [
      'TC1AAA0001 Confirmed. Ksh500.00 sent to JANE DOE 0712345678 on 1/3/26 at 9:00 AM. New M-PESA balance is Ksh1,000.00.',
      'TC9ZZZ0009 Confirmed. Ksh200.00 sent to JOHN DOE 0711111111 on 1/3/26 at 9:10 AM. New M-PESA balance is Ksh800.00.',
    ];
    expect(onlyWanted(messages, codes)).toEqual([messages[0]]);
    // Nothing handed over: every message, as before.
    expect(onlyWanted(messages, null)).toEqual(messages);
  });

  it('is used by Home, Find the difference and the import, which says how far it has got', () => {
    expect(readFileSync('app/(tabs)/index.tsx', 'utf8')).toContain('setBringIn(reconcileLeft.missing!.receipts);');
    const difference = readFileSync('app/mpesa-difference.tsx', 'utf8');
    expect(difference).toContain('setBringIn(plan.bringIn.receipts);');
    expect(difference).toContain('setBringIn(span.missing.filter((item) => !item.savedIn).map((item) => item.receipt));');
    const screen = readFileSync('app/mpesa-import.tsx', 'utf8');
    expect(screen).toContain('readSmsMessages(onlyWanted(result.messages, codes))');
    expect(screen).toContain('testID="mpesa-sms-progress"');
    expect(readFileSync('hooks/useAutoReconcile.ts', 'utf8')).toContain('const codesMissing = Boolean(kept?.left?.missing && !kept.left.missing.receipts);');
  });
});

describe('bringing them in ends finished, with the way on', () => {
  const screen = readFileSync('app/mpesa-import.tsx', 'utf8');
  it('says how many are in, offers Sort them out only for any left Not sure, and Home', () => {
    expect(screen).toContain('broughtInRef.current = brought;');
    expect(screen).toContain('{notSure > 0 ? (');
    expect(screen).toContain('testID="mpesa-brought-in"');
    expect(screen).toContain("onPress={() => router.replace('/sort-entries' as never)}");
    expect(screen).toContain('testID="mpesa-brought-in-home"');
  });
});
