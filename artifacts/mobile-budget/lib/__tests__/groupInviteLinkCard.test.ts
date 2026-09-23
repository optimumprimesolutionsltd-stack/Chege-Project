import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const card = readFileSync('components/GroupInviteLinkCard.tsx', 'utf8');
const settings = readFileSync('app/(tabs)/settings.tsx', 'utf8');

// "Share invite on WhatsApp" made a link and sent it in the same tap without
// ever showing it — fine for WhatsApp, a dead end for pasting it anywhere
// else. This shows the link itself, the same way the read-only link below it
// already does.
describe('inviting with a link instead of only by email', () => {
  it('replaces the WhatsApp-only shortcut on the Settings screen', () => {
    expect(settings).toContain('<GroupInviteLinkCard groupName={group?.name} />');
    expect(settings).not.toContain('handleWhatsAppInvite');
    expect(settings).not.toContain('share-invite-whatsapp');
  });

  it('shows the link once created, rather than only firing it off', () => {
    expect(card).toContain('testID="group-invite-link-url"');
    expect(card).toContain('setCreatedUrl(');
  });

  it('reuses the same private-link endpoints the web app already has', () => {
    expect(card).toContain('useCreateGroupInviteLink');
    expect(card).toContain('useGetGroupInviteLinks');
    expect(card).toContain('useRevokeGroupInviteLink');
  });

  it('hides the link again once revoked, rather than leaving a stale copy on screen', () => {
    const revoke = card.slice(card.indexOf('const revoke = async'), card.indexOf('const shareLink ='));
    expect(revoke).toContain('setCreatedUrl(null);');
  });

  it('only shows the full link right after creating or resetting it, matching the read-only link', () => {
    // Privacy: the list endpoint never returns the token, only status and
    // expiry — the plain-text link exists nowhere to be silently reread.
    expect(card).toContain('For privacy the link is only shown when you create or reset it.');
  });

  it('offers WhatsApp and the device share sheet once a link exists', () => {
    expect(card).toContain("Linking.openURL(`https://wa.me/?text=");
    expect(card).toContain('Share.share({ message: createdUrl })');
  });

  it('is reachable only where shared-group access is already being managed', () => {
    expect(settings).toContain('canManageShared && editingAccess');
  });
});
