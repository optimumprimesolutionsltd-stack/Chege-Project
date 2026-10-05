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
  readSessionTokenState,
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

// "Still lapsing out": a phone that could not be asked for the sign-in - its key
// store refusing just after Android restarted the app - is not a signed-out phone.
describe('a secure storage failure', () => {
  it('is reported as a failure, not as no token, after trying again', async () => {
    store.getItemAsync.mockRejectedValue(new Error('keystore unavailable'));
    expect(await readSessionTokenState()).toEqual({ token: null, failed: true });
    expect(store.getItemAsync).toHaveBeenCalledTimes(4);
  });

  it('never makes a 401 count as the session ending', async () => {
    store.getItemAsync.mockRejectedValue(new Error('keystore unavailable'));
    expect(await sessionHasEnded('https://jamvi.test')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still believes a store that answers with nothing, after asking twice', async () => {
    store.getItemAsync.mockResolvedValue(null);
    expect(await readSessionTokenState()).toEqual({ token: null, failed: false });
    expect(store.getItemAsync).toHaveBeenCalledTimes(2);
  });
});
