import { fixPlan, type DifferenceSpan } from './mpesaLiveBalance';

/**
 * What Find the difference leaves for the person once it has fixed everything
 * with one sure answer (lib/autoReconcile). Kept apart from it so it can be
 * worked out and tested without reading a phone's messages.
 */
export type Leftover = {
  /** In Jamvi's M-Pesa account but in none of the messages. */
  extra: number;
  /** In the messages but not saved anywhere, and the days they fall in. */
  missing: { count: number; from: string; to: string } | null;
};

/** What only the person can answer, from the spans still open. */
export function leftoverOf(spans: readonly DifferenceSpan[]): Leftover {
  const plan = fixPlan(spans);
  const extra = spans.reduce((sum, span) => sum + span.extra.length, 0);
  return { extra, missing: plan.bringIn };
}

/** Whether anything is left for the person at all. */
export const needsYou = (left: Leftover | null | undefined): boolean => !!left && (left.extra > 0 || (left.missing?.count ?? 0) > 0);

/** The one line Waiting for you shows. */
export function leftoverText(left: Leftover): string {
  const parts: string[] = [];
  if (left.missing?.count) parts.push(`${left.missing.count} M-Pesa ${left.missing.count === 1 ? 'payment' : 'payments'} to bring in`);
  if (left.extra) parts.push(`${left.extra} ${left.extra === 1 ? 'entry' : 'entries'} M-Pesa never had`);
  return parts.join(' · ');
}

