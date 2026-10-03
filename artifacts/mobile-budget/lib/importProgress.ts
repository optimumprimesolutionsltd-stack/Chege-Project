import { useSyncExternalStore } from 'react';

/**
 * How an M-Pesa import's saving is going, for the bar the rest of the app
 * shows while it runs.
 *
 * Saving carries on when the person leaves the import screen, but nothing
 * said so: they either sat and watched a long statement save, or left and
 * never learned what was saved and what failed. The import screen reports
 * here, and the bar reads it anywhere.
 */
export type ImportProgress =
  | { stage: 'saving'; done: number; total: number }
  | { stage: 'done'; saved: number; repeats: number; failed: number };

let current: ImportProgress | null = null;
let changedAt = 0;
const listeners = new Set<() => void>();

export function setImportProgress(next: ImportProgress | null): void {
  current = next;
  changedAt = Date.now();
  for (const listener of listeners) listener();
}

/** A save that has not moved for this long is taken to have stopped. */
export const SAVE_STALLED_MS = 120_000;

/**
 * Whether the running save has stopped moving - every request it makes now
 * has a time limit (lib/saveRetry), so one still "saving" after this long
 * without a single entry done is not going to finish by itself.
 */
export function importSaveStalled(now = Date.now()): boolean {
  return current?.stage === 'saving' && now - changedAt >= SAVE_STALLED_MS;
}

export function getImportProgress(): ImportProgress | null {
  return current;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useImportProgress(): ImportProgress | null {
  return useSyncExternalStore(subscribe, getImportProgress, getImportProgress);
}

/** What the bar says. */
export function importProgressText(progress: ImportProgress): string {
  if (progress.stage === 'saving') return `Saving M-Pesa entries · ${progress.done} of ${progress.total}`;
  const parts = [`${progress.saved} saved`];
  if (progress.repeats > 0) parts.push(`${progress.repeats} already recorded`);
  if (progress.failed > 0) parts.push(`${progress.failed} not saved - import again to retry them`);
  return `M-Pesa import done: ${parts.join(', ')}`;
}
