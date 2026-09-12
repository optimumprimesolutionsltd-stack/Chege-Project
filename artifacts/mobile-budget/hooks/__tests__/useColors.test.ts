import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The palette has to keep the same identity between renders.
 *
 * useColors used to spread a fresh object every time it was called, in all
 * thirty-odd components that call it. Nothing looked wrong - the values were
 * identical - but the identity changed on every render, which silently
 * defeated every React.memo it was passed to and invalidated any useMemo that
 * listed it as a dependency. A screen could not be memoised even deliberately.
 *
 * That is why this is pinned: the bug is invisible in behaviour and only shows
 * up as the whole app being slower than it should be.
 */
const source = readFileSync('hooks/useColors.ts', 'utf8');

describe('useColors', () => {
  it('memoises the palette', () => {
    expect(source).toContain('useMemo');
    expect(source).toContain("import { useMemo } from 'react';");
  });

  it('keys the memo on the scheme, the only thing that changes it', () => {
    expect(source).toMatch(/\}, \[resolvedScheme\]\)/);
  });

  it('does not build the palette outside the memo', () => {
    // A spread left above the useMemo would allocate every render again and
    // put the identity back to being unstable.
    const beforeMemo = source.slice(0, source.indexOf('useMemo'));
    expect(beforeMemo).not.toContain('...palette');
  });
});

describe('the expense form relies on that stability', () => {
  const form = readFileSync('app/add-expense.tsx', 'utf8');

  it('memoises the chip list rather than rebuilding it per keystroke', () => {
    expect(form).toContain('const CategoryChip = React.memo(');
    // The name is passed to a stable callback instead of a closure per chip,
    // which is what lets the memo actually hold.
    expect(form).toContain('onSelect={chooseCategory}');
    expect(form).not.toContain('onPress={() => chooseCategory(cat)}');
  });

  it('memoises the derived lists, one of which is an effect dependency', () => {
    expect(form).toContain('const selectablePayers = useMemo(');
    expect(form).toContain('const categoryList = useMemo(');
    expect(form).toContain('const payerSourceIds = useMemo<string[]>(');
  });
});
