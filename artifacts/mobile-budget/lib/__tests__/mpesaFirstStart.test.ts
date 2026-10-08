import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromStatementStart, keepUpSince, startPresets } from '@/lib/mpesaFirstStart';

// "The mpesa process can be a bit overwhelming. The first instance should be a
// user being told to import an mpesa statement from date of his choice to
// current and from there onwards the app starts reading" (8 Oct 2026).
describe('the day to start from', () => {
  it('offers the start of this year, three and six months back', () => {
    expect(startPresets(new Date(2026, 9, 9))).toEqual([
      { key: 'year', label: '1 Jan 2026', from: '2026-01-01' },
      { key: 'three', label: '3 months ago', from: '2026-07-09' },
      { key: 'six', label: '6 months ago', from: '2026-04-09' },
    ]);
  });

  it('lands on the last day of a shorter month, not in the next one', () => {
    const presets = startPresets(new Date(2026, 4, 31));
    expect(presets.find((preset) => preset.key === 'three')?.from).toBe('2026-02-28');
  });
});

describe('a statement that starts earlier than the day chosen', () => {
  const rows = [
    { receipt: 'A', time: '2026-06-30 23:59:00' },
    { receipt: 'B', time: '2026-07-01 00:00:10' },
    { receipt: 'C', time: '2026-08-15 12:00:00' },
  ];

  it('is read from that day on, before its rows become entries', () => {
    expect(fromStatementStart(rows, '2026-07-01').map((row) => row.receipt)).toEqual(['B', 'C']);
    expect(fromStatementStart(rows, '2026-09-01')).toEqual([]);
  });
});

describe('keeping up after the statement', () => {
  it('reads new messages from the start of its last day, so nothing between is missed', () => {
    expect(keepUpSince('2026-10-08')).toBe(new Date('2026-10-08T00:00:00').getTime() - 1);
    expect(keepUpSince(null, 1234)).toBe(1234);
  });
});

describe('the M-Pesa screen the first time', () => {
  const screen = readFileSync('app/mpesa-import.tsx', 'utf8');
  const card = readFileSync('components/MpesaFirstStart.tsx', 'utf8');

  it('leads with the statement alone, once nothing has come in from M-Pesa', () => {
    expect(screen).toContain('const firstRun = mpesaSummary?.imported === false && !rereading;');
    expect(screen).toContain('<MpesaFirstStart from={startFrom} onFrom={setStartFrom} keepsUp={smsReadable} />');
    expect(card).toContain("{step(1, 'From when?')}");
    expect(card).toContain("{step(2, 'Get the statement from M-Pesa')}");
  });

  it('keeps the other ways in one tap away', () => {
    expect(screen).toContain('testID="mpesa-other-ways"');
    expect(screen).toContain('{firstRun && !otherWays ? null : (<>');
  });

  it('leaves out what came before the day chosen', () => {
    expect(screen).toContain('const rows = firstRun ? fromStatementStart(allRows, startFrom) : allRows;');
  });

  it('then turns on reading new messages, from where the statement ended - or says to share them', () => {
    expect(screen).toContain('testID="mpesa-keep-up-turn-on"');
    expect(screen).toContain('await keepSmsAuto({ on: true, since: keepUpSince(statementReading?.lastDate) });');
    expect(screen).toContain('testID="mpesa-keep-up-share"');
  });
});
