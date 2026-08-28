type WorkspacePhotoIdentity = {
  isPrivate?: boolean | null;
  photoUrl?: string | null;
};

export function workspaceIdentityPhotoUrl(
  group: WorkspacePhotoIdentity | undefined,
  user: { profileImageUrl?: string | null } | null | undefined,
): string | null {
  if (!group) return null;
  return group.isPrivate === false
    ? group.photoUrl ?? null
    : user?.profileImageUrl ?? null;
}