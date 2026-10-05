import { ApiError, customFetch } from '@workspace/api-client-react';
import { retryWhenCutOff, whenAppActive } from './saveWhileAway';

/**
 * Saving an import on Jamvi's server.
 *
 * The phone used to send every entry itself, one request each and another for
 * each M-Pesa charge, and had to stay open until the last one: a few hundred
 * took minutes and closing Jamvi stopped them. Now the phone works out the
 * entries as before and hands them all over at once; the server saves them
 * through the same routes, as the same person, and carries on whether or not
 * Jamvi is open. The phone only asks how far it has got.
 */

/** What one line became on the server, keyed by the line's index. */
export type ServerResult =
  | { key: number; outcome: 'saved'; id?: number; otherBudget?: { groupId: number; id: number }; feeFailed?: boolean }
  | { key: number; outcome: 'repeat' }
  | { key: number; outcome: 'failed'; why: string }
  | { key: number; outcome: 'lapsed' };

export type ServerJob = { id: number; status: 'running' | 'done'; total: number; done: number; results?: ServerResult[] };

export type ServerItem = { key: number; built: unknown };

/** A save started before is still going on the server. */
export class EarlierSaveRunning extends Error {
  constructor(readonly job: ServerJob) {
    super(`Your earlier save is still going: ${job.done} of ${job.total} done. Save these once it finishes - anything already saved is skipped.`);
  }
}

const statusOf = (error: unknown) => (error instanceof ApiError ? error.status : (error as { status?: number } | null)?.status);

/**
 * Hands the entries over. The job, or null when this server cannot save them
 * itself yet (an older server, or its table not made): the phone then saves
 * them the old way. A save of this person's still going on the server is
 * thrown as EarlierSaveRunning: its entries may be another list's, so it is
 * waited for, never read back as this one.
 */
export async function startServerSave(
  items: readonly ServerItem[],
  mpesaAccountId: number,
  fetcher: typeof customFetch = customFetch,
): Promise<ServerJob | null> {
  try {
    return await retryWhenCutOff(() =>
      fetcher<ServerJob>('/api/mpesa/import/save-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mpesaAccountId, items }),
      }),
    );
  } catch (error: unknown) {
    const status = statusOf(error);
    // 400: the server could not take the list as a whole ("Those entries could
    // not be read", every entry of a Fix all left unsaved, 5 Oct 2026). Saved
    // one by one instead, each goes in or says what is wrong with it.
    if (status === 400 || status === 404 || status === 503) return null;
    const running = status === 409 ? (error as { data?: { job?: ServerJob } }).data?.job : undefined;
    if (running?.id) throw new EarlierSaveRunning(running);
    throw error;
  }
}

/** Jobs this run of the app is already following, so a screen opened again waits instead of following twice. */
const following = new Set<number>();

export function isFollowingServerSave(jobId: number | null | undefined): boolean {
  return jobId != null && following.has(jobId);
}

/**
 * Asks how the job is going until it is done, telling `onProgress` each time,
 * and gives back what each entry became. Asking waits while Jamvi is behind
 * another app (the save itself does not), and is tried again through a dropped
 * connection. Null when the server no longer has the job.
 */
export async function followServerSave(
  jobId: number,
  onProgress: (done: number, total: number) => void,
  options: {
    fetcher?: typeof customFetch;
    pause?: (ms: number) => Promise<void>;
    waitForApp?: () => Promise<void>;
    everyMs?: number;
  } = {},
): Promise<ServerJob | null> {
  const fetcher = options.fetcher ?? customFetch;
  const pause = options.pause ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const waitForApp = options.waitForApp ?? whenAppActive;
  following.add(jobId);
  try {
    for (;;) {
      let job: ServerJob;
      try {
        job = await retryWhenCutOff(() => fetcher<ServerJob>(`/api/mpesa/import/save-jobs/${jobId}`), waitForApp, options.pause);
      } catch (error: unknown) {
        if (statusOf(error) === 404) return null;
        throw error;
      }
      onProgress(job.done, job.total);
      if (job.status === 'done') return job;
      await pause(options.everyMs ?? 1_500);
    }
  } finally {
    following.delete(jobId);
  }
}

/** How a finished job reads in the bar: saved, already there, not saved. */
export function serverSaveCounts(results: readonly ServerResult[]): { saved: number; repeats: number; failed: number } {
  return {
    saved: results.filter((result) => result.outcome === 'saved').length,
    repeats: results.filter((result) => result.outcome === 'repeat').length,
    failed: results.filter((result) => result.outcome === 'failed' || result.outcome === 'lapsed').length,
  };
}

/**
 * A save on the server found running when Jamvi opens or comes back to the
 * front - started before the app was closed - shown in the bar on every
 * screen, and how it ended once it does. Quiet when there is none, when this
 * run of the app is already following it, or when the server cannot be asked.
 */
export async function lookForServerSave(
  show: (progress: { stage: 'saving'; done: number; total: number } | { stage: 'done'; saved: number; repeats: number; failed: number }) => void,
  fetcher: typeof customFetch = customFetch,
): Promise<void> {
  let job: ServerJob | null = null;
  try {
    job = (await fetcher<{ job: ServerJob | null }>('/api/mpesa/import/save-jobs/current')).job;
  } catch {
    return;
  }
  if (!job || job.status !== 'running' || isFollowingServerSave(job.id)) return;
  try {
    const finished = await followServerSave(job.id, (done, total) => show({ stage: 'saving', done, total }), { fetcher });
    if (finished) show({ stage: 'done', ...serverSaveCounts(finished.results ?? []) });
  } catch {
    // Asked again the next time Jamvi comes to the front.
  }
}
