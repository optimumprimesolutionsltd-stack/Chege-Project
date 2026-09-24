import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');

// A group owner can pick an accent colour for the group. That colour was
// then shown to every member who joined, so the app looked different for
// them. Reported as: "the colour for jamvi app should be the default always
// even if a member joins." The picker still stores a choice; no mobile
// screen reads it back any more.
describe('group icons always use the default Jamvi colours', () => {
  it.each([
    ['app/(tabs)/index.tsx'],
    ['app/budget-chooser.tsx'],
    ['components/WorkspaceIdentityRow.tsx'],
  ])('%s does not read a group or workspace accent colour for display', (file) => {
    expect(read(file)).not.toMatch(/(group\??|workspace)\.accentColor/);
  });

  it('settings only reads the group accent to fill the owner picker, never to paint a row', () => {
    const settings = read('app/(tabs)/settings.tsx');
    expect(settings).not.toContain('workspace.accentColor');
    const reads = settings.match(/group\??\.accentColor/g) ?? [];
    // the picker sync effect: an `if` guard, its cast, and the dependency list
    expect(reads.length).toBeLessThanOrEqual(3);
  });

  it('keeps the owner-side picker state (what gets saved) untouched', () => {
    const settings = read('app/(tabs)/settings.tsx');
    expect(settings).toContain('groupAccentColor');
  });
});
