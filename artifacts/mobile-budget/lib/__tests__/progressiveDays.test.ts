import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { firstDays } from '@/lib/progressiveDays';

const day = (date: string, n: number) => ({ date, rows: Array.from({ length: n }, (_, i) => i) });

// "Please check across the app for these lags."
describe('long lists drawn a batch at a time', () => {
  it('takes whole days up to the limit, and always at least one', () => {
    const days = [day('a', 50), day('b', 50), day('c', 50)];
    expect(firstDays(days, 120).map((d) => d.date)).toEqual(['a', 'b']);
    expect(firstDays([day('big', 500)], 120).map((d) => d.date)).toEqual(['big']);
    expect(firstDays(days, 1000)).toHaveLength(3);
  });

  it('is used by All expenses and All income, adding more near the end', () => {
    for (const page of ['expense-ledger', 'income-ledger']) {
      const screen = readFileSync(join(__dirname, '..', '..', 'app', `${page}.tsx`), 'utf8');
      expect(screen).toContain('const paged = useProgressiveDays(days);');
      expect(screen).toContain('onScroll={paged.onScroll}');
      expect(screen).toContain('{paged.shown.map((day) => (');
      expect(screen).toContain('testID="ledger-show-more"');
    }
  });

  it('keeps fewer rows drawn around the screen on every long list', () => {
    const lists = readFileSync(join(__dirname, '..', '..', 'components', 'PageScrollReset.tsx'), 'utf8');
    expect(lists).toContain('const LIST_WINDOW = { initialNumToRender: 12, maxToRenderPerBatch: 10, updateCellsBatchingPeriod: 40, windowSize: 11 } as const;');
    expect(lists).toContain('<FlatList ref={ref} {...LIST_WINDOW} {...props} {...listProps} />');
  });
});
