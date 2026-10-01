import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const home = readFileSync('app/(tabs)/index.tsx', 'utf8');

// "Align everything in a shared group to be in Personal."
describe('a Personal budget has what a shared group has on Home', () => {
  it('shows the areas card, for any workspace, worded for a budget', () => {
    expect(home).toContain("const baseShortcuts = isSharedWorkspace ? SHARED_OVERVIEW_SHORTCUTS : PERSONAL_OVERVIEW_SHORTCUTS;");
    expect(home).toContain("{isSharedWorkspace ? 'Your group areas' : 'Your budget areas'}");
  });

  it('leaves only the group contributions out of Personal, and offers the M-Pesa import in both', () => {
    expect(home).toContain("SHARED_OVERVIEW_SHORTCUTS.filter((shortcut) => shortcut.label !== 'Contributions')");
    expect(home).toContain("label: 'M-Pesa',        color: '#3CDD62', bg: '#0D3428', route: '/mpesa-import'");
  });

  it('shows the budget ring for any workspace', () => {
    expect(home).toContain('{group && (\n            <View style={styles.ringWrap}>'.replace(/\n/g, home.includes('\r\n') ? '\r\n' : '\n'));
  });
});
