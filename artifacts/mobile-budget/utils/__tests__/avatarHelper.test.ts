/**
 * Unit tests for avatarHelper — the avatar rendering logic used by the
 * Settings/Profile screen.
 *
 * Two paths are verified:
 *   1. Image path  — profileImageUrl is present → { kind: 'image', uri }
 *   2. Fallback path — profileImageUrl is absent → { kind: 'initials', text }
 *
 * The settings screen renders <Image> for path 1 and an initials badge for
 * path 2, so these tests lock in the contract between the helper and the UI.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveAvatarProps,
  getDisplayName,
  getInitials,
} from '../avatarHelper.js';

// ---------------------------------------------------------------------------
// getDisplayName
// ---------------------------------------------------------------------------
describe('getDisplayName', () => {
  it('joins firstName and lastName when both are present', () => {
    expect(getDisplayName({ firstName: 'John', lastName: 'Doe' })).toBe('John Doe');
  });

  it('returns just the firstName when lastName is absent', () => {
    expect(getDisplayName({ firstName: 'John', lastName: null })).toBe('John');
  });

  it('returns just the lastName when firstName is absent', () => {
    expect(getDisplayName({ firstName: null, lastName: 'Doe' })).toBe('Doe');
  });

  it('falls back to "Family Member" when both names are null', () => {
    expect(getDisplayName({ firstName: null, lastName: null })).toBe('Family Member');
  });

  it('falls back to "Family Member" when user is null', () => {
    expect(getDisplayName(null)).toBe('Family Member');
  });

  it('falls back to "Family Member" when user is undefined', () => {
    expect(getDisplayName(undefined)).toBe('Family Member');
  });
});

// ---------------------------------------------------------------------------
// getInitials
// ---------------------------------------------------------------------------
describe('getInitials', () => {
  it('returns two uppercase initials from a full name', () => {
    expect(getInitials('John Doe')).toBe('JD');
  });

  it('returns one initial for a single-word name', () => {
    expect(getInitials('John')).toBe('J');
  });

  it('returns only the first two initials for a three-word name', () => {
    expect(getInitials('Mary Jane Watson')).toBe('MJ');
  });

  it('uppercases initials', () => {
    expect(getInitials('alice bob')).toBe('AB');
  });

  it('returns "FM" for the fallback display name', () => {
    expect(getInitials('Family Member')).toBe('FM');
  });
});

// ---------------------------------------------------------------------------
// resolveAvatarProps — image path
// ---------------------------------------------------------------------------
describe('resolveAvatarProps — image path (profileImageUrl present)', () => {
  const imageUrl = 'https://example.com/avatar.jpg';

  it('returns kind "image" when profileImageUrl is a non-empty string', () => {
    const result = resolveAvatarProps({ firstName: 'Jane', profileImageUrl: imageUrl });
    expect(result.kind).toBe('image');
  });

  it('returns the correct uri when profileImageUrl is present', () => {
    const result = resolveAvatarProps({ firstName: 'Jane', profileImageUrl: imageUrl });
    if (result.kind !== 'image') throw new Error('Expected image kind');
    expect(result.uri).toBe(imageUrl);
  });

  it('returns kind "image" even when both names are null (photo takes priority over initials)', () => {
    const result = resolveAvatarProps({ firstName: null, lastName: null, profileImageUrl: imageUrl });
    expect(result.kind).toBe('image');
  });
});

// ---------------------------------------------------------------------------
// resolveAvatarProps — fallback / initials path
// ---------------------------------------------------------------------------
describe('resolveAvatarProps — fallback path (profileImageUrl absent)', () => {
  it('returns kind "initials" when profileImageUrl is null', () => {
    const result = resolveAvatarProps({ firstName: 'Jane', lastName: 'Doe', profileImageUrl: null });
    expect(result.kind).toBe('initials');
  });

  it('returns kind "initials" when profileImageUrl is undefined', () => {
    const result = resolveAvatarProps({ firstName: 'Jane', lastName: 'Doe' });
    expect(result.kind).toBe('initials');
  });

  it('derives correct initials from first+last name', () => {
    const result = resolveAvatarProps({ firstName: 'Jane', lastName: 'Doe', profileImageUrl: null });
    if (result.kind !== 'initials') throw new Error('Expected initials kind');
    expect(result.text).toBe('JD');
  });

  it('derives initials from firstName only when lastName is absent', () => {
    const result = resolveAvatarProps({ firstName: 'Jane', profileImageUrl: null });
    if (result.kind !== 'initials') throw new Error('Expected initials kind');
    expect(result.text).toBe('J');
  });

  it('uses "FM" initials for the default fallback display name', () => {
    const result = resolveAvatarProps({ firstName: null, lastName: null, profileImageUrl: null });
    if (result.kind !== 'initials') throw new Error('Expected initials kind');
    expect(result.text).toBe('FM');
  });

  it('returns kind "initials" when user is null', () => {
    const result = resolveAvatarProps(null);
    expect(result.kind).toBe('initials');
  });

  it('returns kind "initials" when user is undefined', () => {
    const result = resolveAvatarProps(undefined);
    expect(result.kind).toBe('initials');
  });
});
