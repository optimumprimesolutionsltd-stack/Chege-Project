/**
 * "Not found" when deleting something is not a failure of the delete.
 *
 * The server answers 404 only when the entry is not in the budget Jamvi is
 * using now: it was already deleted (a second tap, another device, a list that
 * had not refreshed), or the list on screen belongs to another budget. Either
 * way the entry is not there, which is what deleting it was meant to achieve, so
 * this is treated as done and the list is refreshed, rather than showing a raw
 * "HTTP 404 : Not found".
 */
export function isNotFound(error: unknown): boolean {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  if (status === 404) return true;
  return error instanceof Error && /\b404\b/.test(error.message) && /not found/i.test(error.message);
}

export const ALREADY_GONE_TITLE = 'Already gone';

export const ALREADY_GONE_MESSAGE =
  'That entry is not here any more. It may already have been deleted, or it belongs to a different budget. The list has been refreshed.';
