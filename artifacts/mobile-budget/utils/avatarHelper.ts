/**
 * Avatar helper utilities for the Settings/Profile screen.
 *
 * Extracted so both the screen and the test suite use exactly the same logic.
 */

export interface AvatarUser {
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
}

/**
 * Returns the display name for a user, falling back to 'Member'.
 */
export function getDisplayName(user: AvatarUser | null | undefined): string {
  return (
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    'Member'
  );
}

/**
 * Returns up to 2 uppercase initials derived from the display name.
 * Used as the fallback when profileImageUrl is absent.
 */
export function getInitials(displayName: string): string {
  return displayName
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Returns { kind: 'image', uri } when profileImageUrl is present,
 * or { kind: 'initials', text } when it is absent.
 *
 * This is the core branch the Settings screen renders — test both paths here.
 */
export type AvatarProps =
  | { kind: 'image'; uri: string }
  | { kind: 'initials'; text: string };

export function resolveAvatarProps(
  user: AvatarUser | null | undefined,
): AvatarProps {
  const displayName = getDisplayName(user);
  if (user?.profileImageUrl) {
    return { kind: 'image', uri: user.profileImageUrl };
  }
  return { kind: 'initials', text: getInitials(displayName) };
}
