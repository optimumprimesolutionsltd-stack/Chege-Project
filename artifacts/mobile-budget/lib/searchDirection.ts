/**
 * Search by which way the money moved - "in the search buttons, can we have
 * logic of money inwards, money outwards etc for batch search" (8 Oct 2026) -
 * and the totals of what was found, so a batch (everything from one person,
 * every rent payment) can be added up.
 */
export type MoneyWay = 'all' | 'in' | 'out';

type Found = { kind: string; amount: number | string; direction?: 'in' | 'out' };

/** In: money in and income. Out: payments and expenses. Goals are neither. */
export function wayOf(result: Found): 'in' | 'out' | null {
  if (result.direction) return result.direction;
  if (result.kind === 'income') return 'in';
  if (result.kind === 'expenses') return 'out';
  return null;
}

export function byWay<T extends Found>(results: readonly T[], way: MoneyWay): T[] {
  return way === 'all' ? [...results] : results.filter((result) => wayOf(result) === way);
}

export function totalsOf(results: readonly Found[]): { count: number; in: number; out: number } {
  let moneyIn = 0;
  let moneyOut = 0;
  for (const result of results) {
    const way = wayOf(result);
    if (way === 'in') moneyIn += Number(result.amount) || 0;
    else if (way === 'out') moneyOut += Number(result.amount) || 0;
  }
  return { count: results.length, in: Math.round(moneyIn * 100) / 100, out: Math.round(moneyOut * 100) / 100 };
}

/** The server sends at most this many of each kind; at the cap, totals cover only those. */
export const PER_KIND_CAP = 50;
export const reachedCap = (results: readonly { kind: string }[]): boolean => {
  const counts = new Map<string, number>();
  for (const result of results) counts.set(result.kind, (counts.get(result.kind) ?? 0) + 1);
  return [...counts.values()].some((count) => count >= PER_KIND_CAP);
};
