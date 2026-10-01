import { AppState, type AppStateStatus } from 'react-native';
import { ApiError } from '@workspace/api-client-react';

/**
 * Keeping a long save going when the person switches to another app.
 *
 * Android pauses an app soon after it leaves the screen, so a save of a few
 * hundred entries stopped the moment somebody checked a message: requests in
 * flight were cut off and counted as not saved, and the rest never went. Now
 * the save waits while Jamvi is away, carries on when it is back, and an entry
 * whose request was cut off is tried again rather than reported as failed.
 */

/** Resolves at once while Jamvi is in front; otherwise when it next is. */
export function whenAppActive(current: () => AppStateStatus = () => AppState.currentState): Promise<void> {
  if (current() === 'active') return Promise.resolve();
  return new Promise((resolve) => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      subscription.remove();
      resolve();
    });
  });
}

/**
 * Whether a failure was the connection rather than an answer: no response at
 * all, or the server falling over. A refusal - "already recorded", a missing
 * category - is an answer, and trying again would only repeat it.
 */
export function wasCutOff(error: unknown): boolean {
  if (error instanceof ApiError) return error.status >= 500;
  return true;
}

/**
 * Runs `task`, and if the connection was cut off, waits for Jamvi to be in
 * front again and tries once more - up to `attempts` times in all. A request
 * that did reach the server before the cut is refused the second time as
 * already recorded, so nothing is saved twice.
 */
export async function retryWhenCutOff<T>(
  task: () => Promise<T>,
  attempts = 3,
  waitForApp: () => Promise<void> = whenAppActive,
  pause: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await waitForApp();
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!wasCutOff(error) || attempt === attempts) throw error;
      await pause(1_000 * attempt);
    }
  }
  throw lastError;
}
