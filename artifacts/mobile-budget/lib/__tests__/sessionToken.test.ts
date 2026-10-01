import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock('expo-secure-store', () => store);

import {
  __resetSessionTokenForTests,
  clearSessionToken,
  readSessionToken,
  sessionHasEnded,
  writeSessionToken,
} from '../sessionToken';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function reply(status: number, body: unknown = {}) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

beforeEach(() => {
  __resetSessionTokenForTests();
  vi.clearAllMocks();
});

describe('readSessionToken', () => {
  it('reads secure storage once, then answers from memory', async () => {
    store.getItemAsync.mockResolvedValue('sid-1');
    for (let i = 0; i < 1000; i++) expect(await readSessionToken()).toBe('sid-1');
    expect(store.getItemAsync).toHaveBeenCalledTimes(1);
  });

  it('tries an empty or failed read once more before believing it', async () => {
    store.getItemAsync.mockRejectedValueOnce(new Error('keystore busy')).mockResolvedValueOnce('sid-2');
    expect(await readSessionToken()).toBe('sid-2');
  });

  it('forgets the token on sign-out and remembers a new one on sign-in', async () => {
    await writeSessionToken('sid-3');
    expect(await readSessionToken()).toBe('sid-3');
    await clearSessionToken();
    store.getItemAsync.mockResolvedValue(null);
    expect(await readSessionToken()).toBeNull();
    expect(store.deleteItemAsync).toHaveBeenCalled();
  });
});

describe('sessionHasEnded', () => {
  beforeEach(() => store.getItemAsync.mockResolvedValue('sid'));

  it('keeps the person signed in while the server still knows them', async () => {
    fetchMock.mockResolvedValue(reply(200, { user: { id: 'u1' } }));
    expect(await sessionHasEnded('https://x')).toBe(false);
  });

  it('ends only when the server has no user for the token', async () => {
    fetchMock.mockResolvedValue(reply(200, { user: null }));
    expect(await sessionHasEnded('https://x')).toBe(true);
    fetchMock.mockResolvedValue(reply(401));
    expect(await sessionHasEnded('https://x')).toBe(true);
  });

  it('keeps them signed in when the check itself fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await sessionHasEnded('https://x')).toBe(false);
    fetchMock.mockResolvedValue(reply(502));
    expect(await sessionHasEnded('https://x')).toBe(false);
  });

  it('a burst of 401s shares one check', async () => {
    fetchMock.mockResolvedValue(reply(200, { user: { id: 'u1' } }));
    await Promise.all(Array.from({ length: 50 }, () => sessionHasEnded('https://x')));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
