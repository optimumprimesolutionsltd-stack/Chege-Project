import { describe, expect, it } from 'vitest';
import { workspaceIdentityPhotoUrl } from '../../utils/workspaceIdentityPhoto';

describe('workspaceIdentityPhotoUrl', () => {
  it('uses the signed-in person photo for a Personal budget', () => {
    expect(
      workspaceIdentityPhotoUrl(
        { isPrivate: true, photoUrl: null },
        { profileImageUrl: 'https://example.com/person.jpg' },
      ),
    ).toBe('https://example.com/person.jpg');
  });

  it('uses the independent group photo for a Shared budget', () => {
    expect(
      workspaceIdentityPhotoUrl(
        { isPrivate: false, photoUrl: 'https://example.com/group.jpg' },
        { profileImageUrl: 'https://example.com/person.jpg' },
      ),
    ).toBe('https://example.com/group.jpg');
  });

  it('returns no photo when the relevant identity has none', () => {
    expect(workspaceIdentityPhotoUrl({ isPrivate: true }, null)).toBeNull();
    expect(workspaceIdentityPhotoUrl({ isPrivate: false }, null)).toBeNull();
  });
});