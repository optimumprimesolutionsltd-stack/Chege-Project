import { retrySave } from "./save-retry";

/**
 * Saving an import on Jamvi's server - as the phone does (mobile-budget
 * lib/serverSave.ts).
 *
 * The browser used to send every entry itself, one request each and another
 * for each M-Pesa charge, and had to stay open on the page until the last one:
 * closing the tab stopped the save. Now the entries are worked out here as
 * before and handed over all at once; the server saves them through the same
 * routes, as the same person, whether or not this tab stays open. The page
 * only asks how far it has got.
 */

/** What one line became on the server, keyed by the line's index. */
export type ServerResult =
  | { key: number; outcome: "saved"; id?: number; otherBudget?: { groupId: number; id: number }; feeFailed?: boolean }
  | { key: number; outcome: "repeat" }
  | { key: number; outcome: "failed"; why: string }
  | { key: number; outcome: "lapsed" };

export type ServerJob = { id: number; status: "running" | "done"; total: number; done: number; results?: ServerResult[] };

export type ServerItem = { key: number; built: unknown };

/** A refusal, carrying its status and the server's answer like the generated client's errors. */
export class SaveRequestError extends Error {
  constructor(readonly status: number, readonly data: unknown) {
    const reason = (data as { error?: unknown } | null)?.error;
    super(typeof reason === "string" && reason.trim() ? reason.trim() : `HTTP ${status}`);
  }
}

export type Fetcher = typeof fetch;

async function ask<T>(fetcher: Fetcher, path: string, init?: RequestInit): Promise<T> {
  // A request that never comes back fails as no answer at all, so it is tried again (lib/save-retry).
  const response = await fetcher(path, { credentials: "include", ...init });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) throw new SaveRequestError(response.status, data);
  return data as T;
}

/** A save started before is still going on the server. */
export class EarlierSaveRunning extends Error {
  constructor(readonly job: ServerJob) {
    super(`Your earlier save is still going: ${job.done} of ${job.total} done. Save these once it finishes - anything already saved is skipped.`);
  }
}

const statusOf = (error: unknown) => (error as { status?: unknown } | null)?.status;

/**
 * Hands the entries over. The job, or null when this server cannot save them
 * itself yet (an older server, or its table not made): the page then saves
 * them the old way. A save of this person's still going on the server is
 * thrown as EarlierSaveRunning: its entries may be another list's, so it is
 * waited for, never read back as this one.
 */
export async function startServerSave(
  items: readonly ServerItem[],
  mpesaAccountId: number,
  fetcher: Fetcher = fetch,
  pause?: (ms: number) => Promise<void>,
): Promise<ServerJob | null> {
  try {
    return await retrySave(
      () =>
        ask<ServerJob>(fetcher, "/api/mpesa/import/save-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mpesaAccountId, items }),
        }),
      { pause },
    );
  } catch (error) {
    const status = statusOf(error);
    if (status === 404 || status === 503) return null;
    const running = status === 409 ? (error as { data?: { job?: ServerJob } }).data?.job : undefined;
    if (running?.id) throw new EarlierSaveRunning(running);
    throw error;
  }
}

/**
 * Jobs the import page is already following, so it does not take one up twice
 * and do what follows a save (remembered payees, debts, names) twice. The bar
 * follows without counting here: the page still picks the job up after it.
 */
const following = new Set<number>();

export function isFollowingServerSave(jobId: number | null | undefined): boolean {
  return jobId != null && following.has(jobId);
}

/**
 * Asks how the job is going until it is done, telling `onProgress` each time,
 * and gives back what each entry became. Tried again through a dropped
 * connection. Null when the server no longer has the job.
 */
export async function followServerSave(
  jobId: number,
  onProgress: (done: number, total: number) => void,
  options: { fetcher?: Fetcher; pause?: (ms: number) => Promise<void>; everyMs?: number; byBar?: boolean } = {},
): Promise<ServerJob | null> {
  const fetcher = options.fetcher ?? fetch;
  const pause = options.pause ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  if (!options.byBar) following.add(jobId);
  try {
    for (;;) {
      let job: ServerJob;
      try {
        job = await retrySave(() => ask<ServerJob>(fetcher, `/api/mpesa/import/save-jobs/${jobId}`), { pause: options.pause });
      } catch (error) {
        if (statusOf(error) === 404) return null;
        throw error;
      }
      onProgress(job.done, job.total);
      if (job.status === "done") return job;
      await pause(options.everyMs ?? 1_500);
    }
  } finally {
    if (!options.byBar) following.delete(jobId);
  }
}

/** How a finished job reads: saved, already there, not saved. */
export function serverSaveCounts(results: readonly ServerResult[]): { saved: number; repeats: number; failed: number } {
  return {
    saved: results.filter((result) => result.outcome === "saved").length,
    repeats: results.filter((result) => result.outcome === "repeat").length,
    failed: results.filter((result) => result.outcome === "failed" || result.outcome === "lapsed").length,
  };
}

export type SaveProgress =
  | { stage: "saving"; done: number; total: number }
  | { stage: "done"; saved: number; repeats: number; failed: number };

/**
 * A save on the server found running when Jamvi opens, or when its tab comes
 * back to the front - started before the tab was closed - shown in the bar on
 * every page, and how it ended once it does. Quiet when there is none, when
 * this page already follows it, or when the server cannot be asked.
 */
export async function lookForServerSave(show: (progress: SaveProgress) => void, fetcher: Fetcher = fetch): Promise<void> {
  let job: ServerJob | null = null;
  try {
    job = (await ask<{ job: ServerJob | null }>(fetcher, "/api/mpesa/import/save-jobs/current")).job;
  } catch {
    return;
  }
  if (!job || job.status !== "running" || isFollowingServerSave(job.id)) return;
  try {
    const finished = await followServerSave(job.id, (done, total) => show({ stage: "saving", done, total }), { fetcher, byBar: true });
    if (finished) show({ stage: "done", ...serverSaveCounts(finished.results ?? []) });
  } catch {
    // Asked again the next time the tab comes to the front.
  }
}

/** What the bar says. */
export function saveProgressText(progress: SaveProgress): string {
  if (progress.stage === "saving") return `Saving M-Pesa entries · ${progress.done} of ${progress.total}`;
  const parts = [`${progress.saved} saved`];
  if (progress.repeats > 0) parts.push(`${progress.repeats} already recorded`);
  if (progress.failed > 0) parts.push(`${progress.failed} not saved - import again to retry them`);
  return `M-Pesa import done: ${parts.join(", ")}`;
}

// The progress the bar shows, shared between the import page and the bar.
let current: SaveProgress | null = null;
const listeners = new Set<() => void>();

export function setSaveProgressBar(next: SaveProgress | null): void {
  current = next;
  for (const listener of listeners) listener();
}

export function getSaveProgressBar(): SaveProgress | null {
  return current;
}

export function subscribeSaveProgressBar(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
