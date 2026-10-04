import { isServerHiccup } from './saveRetry';

/**
 * The reason, in a sentence. A server that did not answer came back as the
 * host's own error page - raw HTML on the screen (4 Oct 2026) - so that is
 * never shown.
 */
export function differenceError(reason: unknown): string {
  const status = (reason as { status?: unknown } | null)?.status;
  if (isServerHiccup(reason) || (typeof status === 'number' && status >= 500)) {
    return 'Jamvi could not reach its server just then, so nothing was checked. Nothing was changed.';
  }
  const answer = (reason as { data?: { error?: unknown } } | null)?.data?.error;
  if (typeof answer === 'string' && answer.trim()) return answer.trim();
  const message = reason instanceof Error ? reason.message.replace(/^HTTP \d{3}[^:]*:\s*/, '').trim() : '';
  return message && !/<[a-z!]/i.test(message) ? message : 'Could not check just then.';
}
