import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const home = readFileSync('app/(tabs)/index.tsx', 'utf8');

// The only way to reach the invite link from Home used to be the setup
// guide's one-time "Invite a member" step, which retires the moment setup is
// complete — leaving a group that goes on adding people long after setup is
// done with no way back to it from the homescreen at all. Reported as: "the
// invite on homescreen is not there" once the guide had legitimately retired.
describe('a way to invite that outlives the setup guide', () => {
  it('adds an Invite tile to the group overview grid, reusing the fixed openInvite deep link', () => {
    expect(home).toContain("route: '/(tabs)/settings?openInvite=1'");
    expect(home).toContain("label: 'Invite'");
  });

  it('offers it only to owners and admins, matching Settings\' own GROUP ACCESS gate', () => {
    const block = home.slice(home.indexOf('const canManageAccess'), home.indexOf('const overviewShortcuts') + 200);
    expect(block).toContain("const canManageAccess = isSharedWorkspace && (group?.role === 'owner' || group?.role === 'admin');");
    expect(block).toContain('? [...SHARED_OVERVIEW_SHORTCUTS, INVITE_SHORTCUT]');
    expect(block).toContain(': SHARED_OVERVIEW_SHORTCUTS;');
  });

  it('renders from the derived list, not the static one, so the gate actually applies', () => {
    expect(home).toContain('{overviewShortcuts.map((shortcut) =>');
    expect(home).not.toContain('{SHARED_OVERVIEW_SHORTCUTS.map((shortcut) =>');
  });
});
