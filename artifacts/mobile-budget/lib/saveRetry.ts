import type { PostingApi } from './savePosting';

/**
 * Saving through a server that is briefly not there.
 *
 * When Jamvi's server restarts - every time an update goes out - it answers for
 * a minute or so with its host's own "502 Bad Gateway" page. The import tried
 * an entry three times in three seconds and then printed that page, HTML and
 * all, under the entry ("Christopher Maina: HTTP 502 : <!DOCTYPE html>…"), and
 * the M-Pesa charge with it was never tried again at all.
 *
 * Now a hiccup like that is waited out, for about a minute, on the entry and on
 * its charge alike; and whatever still fails is said in a sentence.
 *
 * Shared with the web (sync-web-twins.py).
 */

const statusOf = (error: unknown): number | undefined => {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
};

/** No answer at all, or the host saying the server is not there just now. */
export function isServerHiccup(error: unknown): boolean {
  const status = statusOf(error);
  return status === undefined || status === 502 || status === 503 || status === 504;
}

/** Waits between tries while the server is not there: about a minute in all. */
export const HICCUP_DELAYS = [2_000, 4_000, 8_000, 15_000, 30_000];
/** A server error that is an answer (500) is tried again only briefly: it is more likely a fault than a restart. */
export const ERROR_DELAYS = [1_000, 2_000];

/**
 * Runs `task`, trying again through a server hiccup or a server error. A
 * refusal (400s - "already recorded", a missing category) is an answer and is
 * never repeated. A request that did reach the server before the cut is refused
 * the second time as already recorded, so nothing is saved twice. `before`
 * runs ahead of every try (the phone waits there while Jamvi is behind another app).
 */
/** How long one request may take before it is given up on and tried again. */
export const REQUEST_TIME_LIMIT_MS = 45_000;

/** `promise`, or a failure with no status (a hiccup) once `ms` pass without an answer. */
export function withTimeLimit<T>(promise: Promise<T>, ms = REQUEST_TIME_LIMIT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('No answer from the server in time.')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

export async function retrySave<T>(
  task: () => Promise<T>,
  options: { before?: () => Promise<void>; pause?: (ms: number) => Promise<void>; timeLimitMs?: number } = {},
): Promise<T> {
  const pause = options.pause ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt += 1) {
    if (options.before) await options.before();
    try {
      // A request that never answers used to hold the whole save "still going"
      // for ever. A late answer that did save is refused next time as already
      // recorded, so nothing is saved twice.
      return await withTimeLimit(task(), options.timeLimitMs);
    } catch (error) {
      const status = statusOf(error);
      const delays = isServerHiccup(error) ? HICCUP_DELAYS : status !== undefined && status >= 500 ? ERROR_DELAYS : [];
      if (attempt >= delays.length) throw error;
      await pause(delays[attempt]);
    }
  }
}

/** Every request a save makes, each tried again through a hiccup - the charge as much as the entry. */
export function withRetries(api: PostingApi, retry: <T>(task: () => Promise<T>) => Promise<T>): PostingApi {
  return {
    deposit: (data) => retry(() => api.deposit(data)),
    disbursement: (data) => retry(() => api.disbursement(data)),
    bankToBank: (data) => retry(() => api.bankToBank(data)),
    toSavings: (data) => retry(() => api.toSavings(data)),
    fromSavings: (data) => retry(() => api.fromSavings(data)),
    otherBudget: (groupId, direction, data) => retry(() => api.otherBudget(groupId, direction, data)),
  };
}

/**
 * Why an entry did not save, in a sentence. The server's own words when it
 * gave a reason; never a status code or a web page.
 */
export function plainSaveError(error: unknown): string {
  const status = statusOf(error);
  if (isServerHiccup(error) || (status !== undefined && status >= 500)) {
    return 'Jamvi could not reach its server just then. Nothing was lost - tap Save again to try this one.';
  }
  const reason = (error as { data?: { error?: unknown } } | null)?.data?.error;
  if (typeof reason === 'string' && reason.trim()) return reason.trim();
  const message = error instanceof Error ? error.message : '';
  const plain = message.replace(/^HTTP \d{3}[^:]*:\s*/, '').trim();
  return plain && !/<[a-z!]/i.test(plain) ? plain : 'It was not saved. Tap Save again to try it.';
}

/**
 * Why M-Pesa messages could not be read, in a sentence. Reading saves nothing,
 * so a server hiccup says to read them again - not "tap Save", which the
 * screen being read into does not have yet.
 */
export function plainReadError(error: unknown): string {
  const status = statusOf(error);
  if (isServerHiccup(error) || (status !== undefined && status >= 500)) {
    return 'Jamvi could not reach its server just then, so the messages were not read. Nothing was saved - check your connection and try again.';
  }
  const reason = (error as { data?: { error?: unknown } } | null)?.data?.error;
  if (typeof reason === 'string' && reason.trim()) return reason.trim();
  const message = error instanceof Error ? error.message : '';
  const plain = message.replace(/^HTTP \d{3}[^:]*:\s*/, '').trim();
  return plain && !/<[a-z!]/i.test(plain) ? plain : 'They could not be read. Please try again.';
}
