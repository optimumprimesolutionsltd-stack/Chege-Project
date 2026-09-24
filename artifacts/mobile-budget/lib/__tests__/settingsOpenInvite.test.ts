import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const settings = readFileSync('app/(tabs)/settings.tsx', 'utf8');

// The setup guide's "Invite a member" step sent people to Settings and
// stopped there — the invite form lives inside GROUP ACCESS, folded shut
// behind its own Edit, several sections down a page nothing pointed at.
// Reported as: "invite a member does not take me there."
describe('opening straight to the invite section from ?openInvite=1', () => {
  it('reads the param and opens GROUP ACCESS editing, not just Settings generally', () => {
    expect(settings).toContain("useLocalSearchParams<{ openInvite?: string }>()");
    expect(settings).toContain("if (params.openInvite !== '1' || !group || group.isPrivate) return;");
    expect(settings).toContain('setEditingAccess(true);');
  });

  it('never opens it for a Personal budget, which has no GROUP ACCESS section at all', () => {
    expect(settings).toContain('group.isPrivate) return;');
  });

  it('scrolls to where GROUP ACCESS actually landed, not a guessed offset', () => {
    expect(settings).toContain('const captureGroupAccessTop = useCallback((event: LayoutChangeEvent) => {');
    expect(settings).toContain('groupAccessTop.current = event.nativeEvent.layout.y;');
    expect(settings).toContain('onLayout={captureGroupAccessTop}');
    expect(settings).toContain("scrollRef.current?.scrollTo({ y: Math.max(groupAccessTop.current - 12, 0), animated: true });");
  });

  it('shares the same scroll ref the page\'s own PageScrollView already exposes', () => {
    expect(settings).toContain('<PageScrollView');
    expect(settings).toContain('ref={scrollRef}');
  });

  // A plain useEffect keyed on params.openInvite only reruns when that
  // string VALUE changes. Expo Router keeps this screen mounted across tab
  // switches, so tapping "Invite a member" on the homepage a second time
  // re-navigates to the identical `?openInvite=1` URL — same string, no
  // dependency change, no rerun. Reported as: "it works but only once, the
  // tab disappears." useFocusEffect reruns on every focus instead.
  it('reruns on every visit, not just the first time the param appears', () => {
    const block = settings.slice(
      settings.indexOf("if (params.openInvite !== '1'") - 400,
      settings.indexOf("}, [params.openInvite, group]),"),
    );
    expect(block).toContain('useFocusEffect(');
    expect(block).not.toMatch(/\buseEffect\(/);
  });
});
