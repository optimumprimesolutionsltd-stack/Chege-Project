import { describe, expect, it } from 'vitest';
import { byWay, reachedCap, totalsOf, wayOf } from '@/lib/searchDirection';

// "In the search buttons, can we have logic of money inwards, money outwards etc for batch search" (8 Oct 2026).
describe('search by which way the money moved', () => {
  const found = [
    { kind: 'bank', amount: 7000, direction: 'in' as const },
    { kind: 'bank', amount: '534', direction: 'out' as const },
    { kind: 'expenses', amount: 1200 },
    { kind: 'income', amount: 50000 },
    { kind: 'goals', amount: 10000 },
  ];

  it('sorts results into in and out; goals are neither', () => {
    expect(found.map(wayOf)).toEqual(['in', 'out', 'out', 'in', null]);
    expect(byWay(found, 'in')).toHaveLength(2);
    expect(byWay(found, 'out')).toHaveLength(2);
    expect(byWay(found, 'all')).toHaveLength(5);
  });

  it('adds up a batch', () => {
    expect(totalsOf(found)).toEqual({ count: 5, in: 57000, out: 1734 });
    expect(totalsOf(byWay(found, 'out'))).toEqual({ count: 2, in: 0, out: 1734 });
  });

  it('says when the server stopped at its cap', () => {
    expect(reachedCap(Array.from({ length: 50 }, () => ({ kind: 'bank' })))).toBe(true);
    expect(reachedCap(found)).toBe(false);
  });
});
