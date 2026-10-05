import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => { store.set(key, value); },
    removeItem: async (key: string) => { store.delete(key); },
  },
}));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));
vi.mock('@workspace/api-client-react', () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly data: unknown) { super(`HTTP ${status}`); }
  }
  return { ApiError, customFetch: vi.fn() };
});

import { ApiError } from '@workspace/api-client-react';
import { clearSavePending, markSavePending, pendingSaveJob } from '@/lib/importSaveJob';
import {
  EarlierSaveRunning,
  followServerSave,
  isFollowingServerSave,
  lookForServerSave,
  serverSaveCounts,
  startServerSave,
  type ServerJob,
} from '@/lib/serverSave';

const refusal = (status: number, data: unknown = null) => new (ApiError as unknown as new (s: number, d: unknown) => Error)(status, data);
const noWait = { pause: async () => {}, waitForApp: async () => {} };

beforeEach(() => store.clear());

// Asked 4 Oct 2026: "I can't do anything when Jamvi is saving and it takes
// time... ensure saving still happens when I exit Jamvi, and the app shows me
// where we are at."
describe('an import saved on the server', () => {
  it('hands every entry over in one request', async () => {
    const fetcher = vi.fn().mockResolvedValue({ id: 7, status: 'running', total: 2, done: 0 });
    const job = await startServerSave([{ key: 0, built: { kind: 'deposit' } }, { key: 3, built: { kind: 'disbursement' } }], 11, fetcher as never);
    expect(job?.id).toBe(7);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [path, init] = fetcher.mock.calls[0];
    expect(path).toBe('/api/mpesa/import/save-jobs');
    expect(JSON.parse(init.body)).toEqual({ mpesaAccountId: 11, items: [{ key: 0, built: { kind: 'deposit' } }, { key: 3, built: { kind: 'disbursement' } }] });
  });

  it('falls back to saving from the phone on a server that cannot yet, or cannot take the list whole', async () => {
    for (const status of [400, 404, 503]) {
      const fetcher = vi.fn().mockRejectedValue(refusal(status));
      // 503 is waited out first, like any server hiccup; it still ends in the fallback.
      vi.useFakeTimers();
      const pending = startServerSave([{ key: 0, built: {} }], 1, fetcher as never);
      await vi.runAllTimersAsync();
      await expect(pending).resolves.toBeNull();
      vi.useRealTimers();
    }
  });

  it('never reads an earlier save still going as this one', async () => {
    const earlier: ServerJob = { id: 5, status: 'running', total: 40, done: 12 };
    const fetcher = vi.fn().mockRejectedValue(refusal(409, { error: 'Your earlier save is still going.', job: earlier }));
    const failure = await startServerSave([{ key: 0, built: {} }], 1, fetcher as never).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(EarlierSaveRunning);
    expect((failure as Error).message).toContain('12 of 40');
  });

  it('asks how far it has got until it is done, telling the bar each time', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ id: 9, status: 'running', total: 3, done: 1 })
      .mockResolvedValueOnce({ id: 9, status: 'running', total: 3, done: 2 })
      .mockResolvedValueOnce({ id: 9, status: 'done', total: 3, done: 3, results: [{ key: 0, outcome: 'saved', id: 1 }] });
    const seen: number[] = [];
    const following = followServerSave(9, (done) => seen.push(done), { fetcher: fetcher as never, ...noWait });
    expect(isFollowingServerSave(9)).toBe(true);
    const job = await following;
    expect(seen).toEqual([1, 2, 3]);
    expect(job?.results).toHaveLength(1);
    expect(isFollowingServerSave(9)).toBe(false);
  });

  it('says how it ended in the bar', () => {
    expect(serverSaveCounts([
      { key: 0, outcome: 'saved' },
      { key: 1, outcome: 'saved', feeFailed: true },
      { key: 2, outcome: 'repeat' },
      { key: 3, outcome: 'failed', why: 'x' },
      { key: 4, outcome: 'lapsed' },
    ])).toEqual({ saved: 2, repeats: 1, failed: 2 });
  });

  it('picks up a save still running when Jamvi opens again, and shows how it ended', async () => {
    const fetcher = vi.fn(async (path: string) => {
      if (path.endsWith('/current')) return { job: { id: 4, status: 'running', total: 2, done: 1 } };
      return { id: 4, status: 'done', total: 2, done: 2, results: [{ key: 0, outcome: 'saved' }, { key: 1, outcome: 'repeat' }] };
    });
    const shown: unknown[] = [];
    await lookForServerSave((progress) => shown.push(progress), fetcher as never);
    expect(shown).toEqual([
      { stage: 'saving', done: 2, total: 2 },
      { stage: 'done', saved: 1, repeats: 1, failed: 0 },
    ]);
  });

  it('stays quiet when nothing is running', async () => {
    const shown: unknown[] = [];
    await lookForServerSave((progress) => shown.push(progress), vi.fn().mockResolvedValue({ job: { id: 4, status: 'done', total: 2, done: 2 } }) as never);
    await lookForServerSave((progress) => shown.push(progress), vi.fn().mockRejectedValue(refusal(401)) as never);
    expect(shown).toEqual([]);
  });

  it('remembers which server save a closed app left, so it is followed and not started again', async () => {
    await markSavePending(3, 21);
    expect(await pendingSaveJob(3)).toBe(21);
    expect(await pendingSaveJob(4)).toBeNull();
    await markSavePending(3);
    expect(await pendingSaveJob(3)).toBeNull();
    await clearSavePending(3);
    expect(await pendingSaveJob(3)).toBeNull();
  });
});

describe('the import screen and the bar', () => {
  const screen = readFileSync('app/mpesa-import.tsx', 'utf8');
  const bar = readFileSync('components/ImportSavingBar.tsx', 'utf8');

  it('saves on the server, and from the phone only when the server cannot', () => {
    expect(screen).toContain('await startServerSave(toSave.map(({ item, built }) => ({ key: item.index, built })), accountId)');
    expect(screen).toMatch(/\} else if \(!resumeJob\) \{\s*\/\/ A server that cannot save them itself yet/);
  });

  it('follows a save left running when Jamvi was closed', () => {
    expect(screen).toContain('const serverJob = await pendingSaveJob(group?.id);');
    expect(screen).toContain('void saveLines(resumeJob);');
  });

  it('asks the server for a running save whenever Jamvi comes to the front', () => {
    expect(bar).toContain('void lookForServerSave(setImportProgress);');
    expect(bar).toContain("if (state === 'active') look();");
  });
});
