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
});
