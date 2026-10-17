import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@workspace/api-client-react', () => ({ customFetch: vi.fn() }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }));
vi.mock('../mpesaSms', () => ({ newMpesaSms: vi.fn() }));

import { shownTime, timesFromMessages, timesFromStatement, twentyFourHour } from '../mpesaTimes';

const root = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

// "Can we have timestamps for the mpesa?" (17 Oct 2026).
describe('the time of day on M-Pesa entries', () => {
  it('reads each receipt with its time from messages, one or many pasted together', () => {
    const pasted = [
      'SJK3ABC123 Confirmed. Ksh500.00 sent to JOHN DOE 0712345678 on 17/10/26 at 3:42 PM. New M-PESA balance is Ksh1,200.00.',
      'SJK3ABC124 Confirmed.You have received Ksh2,000.00 from JANE 0722000000 on 17/10/26 at 12:05 AM New M-PESA balance is Ksh3,200.00.',
      'SJK3ABC125 Confirmed. Ksh100.00 paid to SHOP. New balance with no time printed.',
    ].join('\n');
    expect(timesFromMessages(pasted)).toEqual([
      { receipt: 'SJK3ABC123', time: '15:42' },
      { receipt: 'SJK3ABC124', time: '00:05' },
    ]);
    expect(timesFromMessages(['SJK3ABC126 Confirmed. Ksh50.00 sent to X on 1/9/2026 at 12:30 PM.'])).toEqual([{ receipt: 'SJK3ABC126', time: '12:30' }]);
  });

  it('reads them from statement rows', () => {
    expect(timesFromStatement([
      { receipt: 'SJK3ABC123', time: '2026-10-17 15:42:10' },
      { receipt: 'bad', time: '2026-10-17 15:42:10' },
    ])).toEqual([{ receipt: 'SJK3ABC123', time: '15:42' }]);
  });

  it('shows it the way M-Pesa words it', () => {
    expect(twentyFourHour('12', '00', 'PM')).toBe('12:00');
    expect(twentyFourHour('13', '00', 'PM')).toBeNull();
    expect(shownTime('15:42')).toBe('3:42 PM');
    expect(shownTime('00:05')).toBe('12:05 AM');
    expect(shownTime(null)).toBeNull();
  });

  it('is sent whenever M-Pesa is read, after a save, and once for what is already saved', () => {
    const importer = read('app/mpesa-import.tsx');
    expect(importer).toContain('noteTimes(timesFromMessages(messages));');
    expect(importer).toContain('noteTimes(timesFromMessages(pasted));');
    expect(importer).toContain('noteTimes(timesFromStatement(allRows));');
    expect(importer).toContain('if (readTimes.current.length > 0) void sendMpesaTimes(readTimes.current);');
    expect(read('hooks/useWaitingForYou.ts')).toContain('void backfillMpesaTimes(group?.id);');
  });

  it('shows on Money beside the date', () => {
    expect(read('app/(tabs)/bank.tsx')).toContain('{formatBankDate(item.date)}');
    expect(read('app/(tabs)/bank.tsx')).toContain("shownTime((item as { timeOfDay?: string | null }).timeOfDay) ? ` · ${shownTime(");
  });
});
