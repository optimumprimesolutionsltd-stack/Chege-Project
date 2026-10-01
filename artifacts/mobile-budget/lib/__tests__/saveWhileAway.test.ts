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
    await expect(retryWhenCutOff(task, 3, now, noPause)).resolves.toEqual({ id: 7 });
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('never repeats a refusal such as already recorded', async () => {
    const refused = apiError(409);
    const task = vi.fn().mockRejectedValue(refused);
    await expect(retryWhenCutOff(task, 3, now, noPause)).rejects.toBe(refused);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('gives up after the last attempt', async () => {
    const task = vi.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(retryWhenCutOff(task, 3, now, noPause)).rejects.toThrow('Network request failed');
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('is what the import save uses', () => {
    expect(readFileSync('app/mpesa-import.tsx', 'utf8')).toContain('const posted = await retryWhenCutOff(() => savePosting(built, postingApi, accountId));');
  });
});
