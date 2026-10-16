import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const home = readFileSync('app/(tabs)/index.tsx', 'utf8');

// "Align everything in a shared group to be in Personal."
describe('a Personal budget has what a shared group has on Home', () => {
  // The areas grid repeated the tabs, the + and your picture: gone from Home for
  // everybody (16 Oct 2026). The chama is offered instead, at the foot.
  it('has no areas grid, for any workspace, and offers the chama at the foot', () => {
    expect(home).not.toContain('Your budget areas');
    expect(home).not.toContain('SHARED_OVERVIEW_SHORTCUTS');
    expect(home).toContain('<ChamaCard canStartGroup={mayStartGroup(entitlements)} canInvite={canManageAccess} onScreen={onScreen} currentId={group?.id ?? null} />');
  });

  it('shows the month at a glance for any workspace', () => {
    // The three answers took the budget ring's place on 9 Oct 2026, for both.
    expect(home).toContain('<HomeAnswersCard');
    expect(home).not.toContain('styles.ringWrap');
  });
});
