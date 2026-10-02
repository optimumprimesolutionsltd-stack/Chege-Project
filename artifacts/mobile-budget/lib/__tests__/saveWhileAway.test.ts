import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const listeners = vi.hoisted(() => [] as Array<(state: string) => void>);
vi.mock('react-native', () => ({
  AppState: {
    currentState: 'background',
    addEventListener: (_event: string, listener: (state: string) => void) => {
      listeners.push(listener);
      return { remove: () => listeners.splice(listeners.indexOf(listener), 1) };
    },
  },
}));

import { ApiError } from '@workspace/api-client-react';
import { retryWhenCutOff, wasCutOff, whenAppActive } from '@/lib/saveWhileAway';

const apiError = (status: number) => Object.assign(Object.create(ApiError.prototype), { status }) as ApiError;
const now = () => Promise.resolve();
const noPause = () => Promise.resolve();

// "When I change tabs and want to use my phone it stops saving."
describe('a save waits while Jamvi is away', () => {
  it('carries on as soon as Jamvi is back in front', async () => {
    let done = false;
    const waiting = whenAppActive().then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(false);
    listeners.forEach((listener) => listener('background'));
    await Promise.resolve();
    expect(done).toBe(false);
    [...listeners].forEach((listener) => listener('active'));
    await waiting;
    expect(done).toBe(true);
  });
});

describe('an entry whose request was cut off is tried again', () => {
  it('tells a dropped connection from an answer', () => {
    expect(wasCutOff(new TypeError('Network request failed'))).toBe(true);
    expect(wasCutOff(apiError(502))).toBe(true);
    expect(wasCutOff(apiError(409))).toBe(false);
    expect(wasCutOff(apiError(400))).toBe(false);
  });

  it('tries again after a cut, and saves', async () => {
    const task = vi.fn().mockRejectedValueOnce(new TypeError('Network request failed')).mockResolvedValueOnce({ id: 7 });
    await expect(retryWhenCutOff(task, now, noPause)).resolves.toEqual({ id: 7 });
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('never repeats a refusal such as already recorded', async () => {
    const refused = apiError(409);
    const task = vi.fn().mockRejectedValue(refused);
    await expect(retryWhenCutOff(task, now, noPause)).rejects.toBe(refused);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('waits out a server restart for about a minute before giving up', async () => {
    const waits: number[] = [];
    const restarting = apiError(502);
    const task = vi.fn().mockRejectedValue(restarting);
    await expect(retryWhenCutOff(task, now, async (ms) => { waits.push(ms); })).rejects.toBe(restarting);
    expect(task).toHaveBeenCalledTimes(6);
    expect(waits.reduce((sum, ms) => sum + ms, 0)).toBe(59_000);
  });

  it('tries a plain server error only briefly', async () => {
    const task = vi.fn().mockRejectedValue(apiError(500));
    await expect(retryWhenCutOff(task, now, noPause)).rejects.toBeDefined();
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('is what the import save uses, on the entry and its charge alike', () => {
    const screen = readFileSync('app/mpesa-import.tsx', 'utf8');
    expect(screen).toContain('const postingApi: PostingApi = withRetries(rawPostingApi, (task) => retryWhenCutOff(task));');
    expect(screen).toContain('const posted = await savePosting(built, postingApi, accountId);');
  });
});
