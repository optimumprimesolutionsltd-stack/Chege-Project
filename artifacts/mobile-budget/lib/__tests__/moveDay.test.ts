import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dayOf, movableOnDay, summariseDays } from '../moveDay';

const tx = (id: number, date: string, movable = true) => ({ id, date, movable });
const canMove = (t: { movable: boolean }) => t.movable;

describe('moving a whole day to another account', () => {
  const txs = [
    tx(1, '2026-09-20'),
    tx(2, '2026-09-20T09:00:00.000Z'),
    tx(3, '2026-09-20', false),
    tx(4, '2026-09-22'),
    tx(5, '2026-09-21', false),
  ];

  it('reads the calendar day whatever precision the date has', () => {
    expect(dayOf('2026-09-20T09:00:00.000Z')).toBe('2026-09-20');
  });

  it('lists days that have something movable, newest first, and drops days with nothing', () => {
    expect(summariseDays(txs, canMove)).toEqual([
      { date: '2026-09-22', movable: 1, total: 1 },
      { date: '2026-09-20', movable: 2, total: 3 },
    ]);
  });

  it('moves only the ordinary entries of the chosen day', () => {
    expect(movableOnDay(txs, '2026-09-20', canMove).map((t) => t.id)).toEqual([1, 2]);
    expect(movableOnDay(txs, '2026-09-21', canMove)).toEqual([]);
  });

  it('is wired to the Bank tab using the same rule as the single-entry move', () => {
    const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
    expect(bank).toContain('testID="bank-move-day"');
    expect(bank).toContain('summariseDays(transactions, canMoveTx)');
    expect(bank).toContain('movableOnDay(transactions, moveDayDate, canMoveTx)');
  });
});
