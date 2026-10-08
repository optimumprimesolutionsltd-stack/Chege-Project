/**
 * Search results by month - "can we have months here too" (8 Oct 2026). The
 * month row narrows what was found to one month; with all months showing, the
 * list is split under a heading per month with that month's money in and out.
 */
import { totalsOf } from '@/lib/searchDirection';

type Dated = { kind: string; amount: number | string; direction?: 'in' | 'out'; date?: string | null };

/** "2026-10", or null when there is no usable date (goals). */
export function monthKeyOf(result: { date?: string | null }): string | null {
  const key = result.date?.slice(0, 7) ?? '';
  return /^\d{4}-\d{2}$/.test(key) ? key : null;
}

/** "2026-10" -> "Oct 2026"; the full name with { long: true }. */
export function monthLabel(key: string, options: { long?: boolean } = {}): string {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-KE', {
    month: options.long ? 'long' : 'short',
    year: 'numeric',
  });
}

/** Every month something was found in, newest first. */
export function monthsFound(results: readonly Dated[]): string[] {
  const keys = new Set<string>();
  for (const result of results) {
    const key = monthKeyOf(result);
    if (key) keys.add(key);
  }
  return [...keys].sort().reverse();
}

/** 'all' keeps everything; a month keeps only what happened in it. */
export function byMonth<T extends Dated>(results: readonly T[], month: string): T[] {
  return month === 'all' ? [...results] : results.filter((result) => monthKeyOf(result) === month);
}

export type MonthSection<T> = {
  key: string;
  title: string;
  totals: { count: number; in: number; out: number };
  data: T[];
};

/**
 * Newest month first, newest entry first inside each month. Anything with no
 * date goes last under "No date".
 */
export function sectionsByMonth<T extends Dated>(results: readonly T[]): MonthSection<T>[] {
  const groups = new Map<string, T[]>();
  for (const result of results) {
    const key = monthKeyOf(result) ?? 'none';
    const group = groups.get(key);
    if (group) group.push(result);
    else groups.set(key, [result]);
  }
  const keys = [...groups.keys()].filter((key) => key !== 'none').sort().reverse();
  if (groups.has('none')) keys.push('none');
  return keys.map((key) => {
    const data = [...(groups.get(key) ?? [])].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    return {
      key,
      title: key === 'none' ? 'No date' : monthLabel(key, { long: true }),
      totals: totalsOf(data),
      data,
    };
  });
}
