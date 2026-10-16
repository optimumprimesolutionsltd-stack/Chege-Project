import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const home = readFileSync('app/(tabs)/index.tsx', 'utf8');
const chama = readFileSync('components/ChamaCard.tsx', 'utf8');

// The Invite tile lived in the areas grid, which went on 16 Oct 2026; it now
// sits beside your other budgets in the chama card at the foot of Home.
describe('a way to invite that outlives the setup guide', () => {
  it('is in the chama card, reusing the fixed openInvite deep link', () => {
    expect(chama).toContain("router.push('/(tabs)/settings?openInvite=1' as never)");
    expect(chama).toContain('testID="home-chama-invite"');
  });

  it("offers it only to owners and admins, matching Settings' own GROUP ACCESS gate", () => {
    expect(home).toContain("const canManageAccess = isSharedWorkspace && (group?.role === 'owner' || group?.role === 'admin');");
    expect(home).toContain('canInvite={canManageAccess}');
    expect(chama).toContain('{canInvite ? (');
  });
});
