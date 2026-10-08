/**
 * Starting with M-Pesa: one statement, from a day the person chooses, then
 * Jamvi keeps up from there by reading new M-Pesa messages.
 *
 * "The mpesa process can be a bit overwhelming. The first instance should be a
 * user being told to import an mpesa statement from date of his choice to
 * current and from there onwards the app starts reading" (8 Oct 2026). Before
 * anything has come in from M-Pesa the import screen leads with this alone;
 * the other ways in are one tap away.
 */
import { isoDay } from './dayRange';

export type StartPreset = 'year' | 'three' | 'six';

/** The days offered: the start of this year, three and six months back. A day can also be picked. */
export function startPresets(today: Date = new Date()): Array<{ key: StartPreset; label: string; from: string }> {
  const monthsBack = (months: number) => {
    const day = new Date(today.getFullYear(), today.getMonth() - months, today.getDate());
    // 31 May less three months is 3 March in JavaScript; the last day of February is meant.
    if (day.getDate() !== today.getDate()) day.setDate(0);
    return isoDay(day);
  };
  return [
    { key: 'year', label: `1 Jan ${today.getFullYear()}`, from: `${today.getFullYear()}-01-01` },
    { key: 'three', label: '3 months ago', from: monthsBack(3) },
    { key: 'six', label: '6 months ago', from: monthsBack(6) },
  ];
}

/**
 * The statement from the chosen day on. Rows are left out before they become
 * entries, so the reading is what a statement starting that day would be -
 * its opening balance, first day and Fuliza checks included.
 */
export function fromStatementStart<T extends { time: string }>(rows: readonly T[], from: string): T[] {
  return rows.filter((row) => row.time.slice(0, 10) >= from);
}

/**
 * Where reading new messages starts after the statement: the start of its last
 * day, so nothing between the two is missed. Messages already saved from the
 * statement are recognised by their M-Pesa code and left out.
 */
export function keepUpSince(lastDate: string | null | undefined, now = Date.now()): number {
  if (!lastDate) return now;
  const start = new Date(`${lastDate}T00:00:00`).getTime();
  return Number.isFinite(start) ? start - 1 : now;
}
