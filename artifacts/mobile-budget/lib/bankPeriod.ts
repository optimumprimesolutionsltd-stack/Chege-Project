import { balanceAsAt, type BalanceAccount } from './balanceAsAt';

export type PeriodPreset = 'all' | 'this-month' | 'last-month' | 'this-year' | 'custom';

export interface Period {
  /** Inclusive, YYYY-MM-DD. */
  from: string;
  to: string;
}

type Tx = { type: string; amount: number; date: string };

/** Today's date in Kenya (UTC+3), as YYYY-MM-DD. */
export function nairobiToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The day before a YYYY-MM-DD date. */
export function dayBefore(date: string): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/**
 * The dates a preset covers, or null for 'all' (no narrowing). A custom range
 * comes from the two date boxes; an end before its start is swapped so the
 * range is never empty by accident.
 */
export function periodFor(
  preset: PeriodPreset,
  today: string,
  custom: { from: string; to: string } = { from: '', to: '' },
): Period | null {
  const [y, m] = today.split('-').map(Number);
  switch (preset) {
    case 'all':
      return null;
    case 'this-month':
      return { from: `${y}-${pad(m)}-01`, to: today };
    case 'last-month': {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(lastDay(py, pm))}` };
    }
    case 'this-year':
      return { from: `${y}-01-01`, to: today };
    case 'custom': {
      if (!custom.from && !custom.to) return null;
      const from = custom.from || '0000-01-01';
      const to = custom.to || '9999-12-31';
      return from <= to ? { from, to } : { from: to, to: from };
    }
  }
}

export const inPeriod = (tx: { date: string }, period: Period | null): boolean => {
  if (!period) return true;
  const day = String(tx.date).slice(0, 10);
  return day >= period.from && day <= period.to;
};

/**
 * What an account did over a period: the balance it started the period with,
 * what came in and went out during it, and the balance it ended on.
 */
export function summarisePeriod(account: BalanceAccount & { transactions?: Tx[] | null }, period: Period) {
  const txs = (account?.transactions ?? []).filter((tx) => inPeriod(tx, period));
  const totalIn = txs.filter((tx) => tx.type === 'deposit').reduce((sum, tx) => sum + tx.amount, 0);
  const totalOut = txs.filter((tx) => tx.type !== 'deposit').reduce((sum, tx) => sum + tx.amount, 0);
  return {
    opening: balanceAsAt(account, dayBefore(period.from)),
    closing: balanceAsAt(account, period.to),
    totalIn: Math.round(totalIn * 100) / 100,
    totalOut: Math.round(totalOut * 100) / 100,
  };
}
