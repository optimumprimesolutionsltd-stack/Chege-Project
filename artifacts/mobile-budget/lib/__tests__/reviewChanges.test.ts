import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { currentReview, endReview, offerReview, reviewOrder, tickedIds, tickedTotal, type ReviewRow } from '../reviewChanges';

const root = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const rows: ReviewRow[] = [
  { id: 1, date: '2026-09-01', amount: 50000, description: 'Equity Bulk Account' },
  { id: 2, date: '2026-10-01', amount: -20000, description: 'Equity Bulk Account' },
  { id: 3, date: '2026-10-01', amount: 30000, description: 'Equity Bulk Account' },
];

// "i need a breakdown of those 18 transactions so i can manually confirm ...
// each should have a tick box ... this should be the logic going forward" (17 Oct 2026).
describe('reviewing a change to many entries', () => {
  afterEach(() => endReview());

  it('lists newest first', () => {
    expect(reviewOrder(rows).map((row) => row.id)).toEqual([3, 2, 1]);
  });

  it('changes only the ticked ones, all ticked to start', () => {
    expect(tickedIds(rows, new Set())).toEqual([1, 2, 3]);
    expect(tickedIds(rows, new Set([2]))).toEqual([1, 3]);
    expect(tickedTotal(rows, new Set([2]))).toBe(80000);
    expect(tickedTotal(rows, new Set([1, 2, 3]))).toBe(0);
  });

  it('is handed to the screen and let go after', () => {
    offerReview({ title: 't', message: 'm', rows, actionLabel: (n) => `Move ${n}`, change: async () => {} });
    expect(currentReview()?.rows).toHaveLength(3);
    endReview();
    expect(currentReview()).toBeNull();
  });

  it('has a tick box per entry and changes only those', () => {
    const screen = read('app/review-changes.tsx');
    expect(screen).toContain('accessibilityRole="checkbox"');
    expect(screen).toContain("name={on ? 'check-square' : 'square'}");
    expect(screen).toContain('await review.change(ids);');
    expect(screen).toContain('Leave them all as they are');
  });

  it.each([
    ['hooks/useSourceCorrection.ts'],
    ['app/(tabs)/bank.tsx'],
    ['app/sort-entries.tsx'],
    ['app/named-accounts.tsx'],
  ])('%s offers the list before changing them all', (file) => {
    const src = read(file);
    expect(src).toContain('offerReview({');
    expect(src).toContain("router.push('/review-changes')");
  });

  it('Money offers it on both of its questions', () => {
    const bank = read('app/(tabs)/bank.tsx');
    expect((bank.match(/offerReview\(\{/g) ?? []).length).toBe(2);
    expect(bank).toContain('text: `Show the ${offer.rows.length}`');
    expect(bank).toContain('text: `Show the ${others.length}`');
  });
});
