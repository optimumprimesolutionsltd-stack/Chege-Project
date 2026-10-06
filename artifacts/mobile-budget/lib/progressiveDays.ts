import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/** Rows drawn at first, and added each time the end comes near. */
export const ROWS_PER_BATCH = 120;
/** How close to the end, in points, before more are drawn. */
const NEAR_END = 900;

/**
 * Whole days, from the top, until about `limit` rows are in - never cutting a
 * day in half, and always at least one.
 */
export function firstDays<T extends { rows: readonly unknown[] }>(days: readonly T[], limit: number): T[] {
  const out: T[] = [];
  let rows = 0;
  for (const day of days) {
    if (out.length > 0 && rows + day.rows.length > limit) break;
    out.push(day);
    rows += day.rows.length;
  }
  return out;
}

/**
 * A long list of days drawn a batch at a time.
 *
 * All expenses and All income drew every entry the moment they opened: a year,
 * or All time, is thousands of rows built before the first one shows, and the
 * screen dragged while scrolling and when a view button was tapped. Now the
 * first batch is drawn, and the next as the end of the page comes near.
 */
export function useProgressiveDays<T extends { rows: readonly unknown[] }>(days: readonly T[]) {
  const [limit, setLimit] = useState(ROWS_PER_BATCH);
  // A new range, search or view starts from the top again.
  useEffect(() => setLimit(ROWS_PER_BATCH), [days]);
  const shown = useMemo(() => firstDays(days, limit), [days, limit]);
  const total = useMemo(() => days.reduce((sum, day) => sum + day.rows.length, 0), [days]);
  const shownRows = useMemo(() => shown.reduce((sum, day) => sum + day.rows.length, 0), [shown]);
  const more = shown.length < days.length;
  const showMore = useCallback(() => setLimit((current) => current + ROWS_PER_BATCH), []);
  // "To the end" means the last entry, not the last one drawn so far.
  const showAll = useCallback(() => setLimit(Number.POSITIVE_INFINITY), []);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!more) return;
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - NEAR_END) showMore();
  }, [more, showMore]);
  return { shown, more, showMore, showAll, onScroll, shownRows, total };
}
