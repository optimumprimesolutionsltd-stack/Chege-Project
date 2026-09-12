import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Which budget you are looking at should not scroll away.
 *
 * Home showed the workspace card inside the header gradient, inside the
 * scroll view, so it left the screen as soon as you moved. Every other tab
 * keeps its header outside the scroll view, so Home was the one place you
 * could lose track of whose money you were recording - and recording into the
 * wrong budget is not a mistake the app can spot for you.
 *
 * The card is pinned with stickyHeaderIndices, which needs it to be a direct
 * child of the scroll view. That is the whole reason the gradient is in two
 * pieces: they meet at the exact colour the band behind the card is painted,
 * so the joins cannot be seen in either position.
 */
const source = readFileSync('app/(tabs)/index.tsx', 'utf8');

describe('the workspace card on Home', () => {
  it('is pinned', () => {
    expect(source).toContain('stickyHeaderIndices={[1]}');
  });

  it('is the second direct child, which is the index that is pinned', () => {
    const scroll = source.indexOf('<PageScrollView');
    const body = source.slice(scroll);
    const children = [...body.matchAll(/^ {8}<(LinearGradient|View|HomeTip|DashboardAnnouncement)/gm)];
    expect(children[0][1]).toBe('LinearGradient');
    expect(children[1][1]).toBe('View');
    expect(body.slice(children[1].index, children[1].index + 120)).toContain(
      'styles.workspaceIdentitySticky',
    );
  });

  it('paints the band the colour both gradient pieces meet at', () => {
    // A mismatch here is a visible seam across the header, in one position or
    // the other, and only on a device.
    expect(source).toContain("colors={[colors.brandNavy, '#05255E']}");
    expect(source).toContain("backgroundColor: '#05255E'");
    expect(source).toContain("colors={['#05255E', colors.brandBlue]}");
  });

  it('does not let the top piece add space before the band', () => {
    expect(source).toContain('headerTopPiece: { paddingBottom: 0 }');
  });
});
