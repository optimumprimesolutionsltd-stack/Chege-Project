import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const settings = readFileSync('app/(tabs)/settings.tsx', 'utf8');

// GroupMember.role already included 'viewer' (somebody who joined through
// the read-only link, view-links.ts), but the GROUP ACCESS list's role label
// only ever checked owner/admin and fell through to 'Member' for anything
// else — so a viewer read exactly like a full member in the one screen an
// owner has to tell them apart. Reported as: "how comes a user can make
// entries in view only" — the owner could not see this person was a viewer
// at all, and the only promotion button offered jumped a viewer straight to
// Admin, skipping Member, the tier that actually answers "give them an
// account that can record."
describe('a viewer reads as a viewer in GROUP ACCESS, not as a plain member', () => {
  it('labels a viewer distinctly instead of falling through to Member', () => {
    expect(settings).toContain("member.role === 'viewer' ? 'Viewer — read only' : 'Member'");
  });

  it('offers a way to promote a viewer straight to Member, not only to Admin', () => {
    expect(settings).toContain("onPress={() => handleRoleChange(member, 'member')}");
    expect(settings).toContain('Make a member');
  });

  it('lets handleRoleChange take an explicit target role rather than only toggling admin/member', () => {
    const handler = settings.slice(
      settings.indexOf('const handleRoleChange = async'),
      settings.indexOf('const handleRoleChange = async') + 300,
    );
    expect(handler).toContain("targetRole?: 'admin' | 'member'");
    expect(handler).toContain('targetRole ??');
  });
});
