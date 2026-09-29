import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { arrange, EMPTY_ARRANGEMENT, moveItem, parseArrangement, toggleHidden } from '../layoutPrefs';

const items = [{ id: 'budget' }, { id: 'bank' }, { id: 'goals' }, { id: 'reports' }];
const ids = (list: Array<{ id: string }>) => list.map((item) => item.id);

// "Is it possible for the user to arrange the tabs the way he wants?"
describe('arranging shortcuts', () => {
  it('keeps the usual order until arranged', () => {
    expect(ids(arrange(items, EMPTY_ARRANGEMENT))).toEqual(['budget', 'bank', 'goals', 'reports']);
  });

  it('moves one up or down, and never past either end', () => {
    const once = moveItem(items, EMPTY_ARRANGEMENT, 'goals', -1);
    expect(ids(arrange(items, once))).toEqual(['budget', 'goals', 'bank', 'reports']);
    expect(ids(arrange(items, moveItem(items, EMPTY_ARRANGEMENT, 'budget', -1)))).toEqual(['budget', 'bank', 'goals', 'reports']);
  });

  it('hides and shows, keeping hidden ones in place for when they come back', () => {
    const hidden = toggleHidden(EMPTY_ARRANGEMENT, 'bank');
    expect(ids(arrange(items, hidden))).toEqual(['budget', 'goals', 'reports']);
    expect(ids(arrange(items, hidden, true))).toEqual(['budget', 'bank', 'goals', 'reports']);
    expect(toggleHidden(hidden, 'bank').hidden).toEqual([]);
  });

  it('puts a shortcut added later after the arranged ones, and forgets ones that are gone', () => {
    const saved = { order: ['reports', 'gone', 'budget'], hidden: [] };
    expect(ids(arrange(items, saved))).toEqual(['reports', 'budget', 'bank', 'goals']);
  });

  it('reads back what was kept, or the usual order when it cannot', () => {
    expect(parseArrangement(JSON.stringify({ order: ['bank', 3], hidden: ['goals'] }))).toEqual({ order: ['bank'], hidden: ['goals'] });
    expect(parseArrangement('nope')).toEqual(EMPTY_ARRANGEMENT);
  });
});

describe('where it is used', () => {
  it('Home arranges its group areas per budget, from an Arrange link', () => {
    const home = readFileSync('app/(tabs)/index.tsx', 'utf8');
    expect(home).toContain('useArrangement(homeAreasKey(group?.id))');
    expect(home).toContain('testID="overview-arrange"');
  });

  it('the quick-action bar shows the first four arranged, and opens Arrange on a long press or from More', () => {
    const bar = readFileSync('components/GlobalFAB.tsx', 'utf8');
    const more = readFileSync('app/(tabs)/more.tsx', 'utf8');
    expect(bar).toContain('const shownActions = arrange(MAIN_ACTIONS, arrangement).slice(0, QUICK_ACTION_SLOTS);');
    expect(bar).toContain('onLongPress={() => { setBankingOpen(false); setArranging(true); }}');
    expect(more).toContain('onPress={openQuickActionsArranger}');
  });
});
