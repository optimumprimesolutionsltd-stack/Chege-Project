// Mirrors artifacts/family-budget/src/lib/subscription-status.ts — the wording a
// member reads about where they stand must be identical on both platforms.

export type SubscriptionStatusCode =
  | 'trial'
  | 'pending'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'expired';

export interface MemberEntitlements {
  packageCode: string | null;
  packageName: string;
  fullAccess: boolean;
  status: SubscriptionStatusCode | null;
  billingInterval: 'monthly' | 'annual' | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
}

// Kenya is UTC+3 all year. Access runs to the midnight that ends its last
// day, so that last day is the day before the stored end.
const KENYA_MS = 3 * 3_600_000;
const kenyaDayNumber = (ms: number) => Math.floor((ms + KENYA_MS) / 86_400_000);

/**
 * Whole days left after today, by Kenya's calendar: a 14-day trial begun today
 * says 14, its last day says 0 ("ends today"). Counting hours rounded up said
 * 15 on the first day ("15 days or 14 days?", 5 Oct 2026).
 */
export function daysUntil(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return null;
  return kenyaDayNumber(end - 1) - kenyaDayNumber(now.getTime());
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A calendar date a member can actually remember, alongside the relative
 *  day-count — "45 days left" is easy to lose track of; a date is not. It is
 *  the last day with access, in Kenya, whatever the phone's own time zone. */
export function formatDeadline(iso: string | null): string | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return null;
  const last = new Date(end - 1 + KENYA_MS);
  return `${last.getUTCDate()} ${MONTH_NAMES[last.getUTCMonth()]} ${last.getUTCFullYear()}`;
}

/**
 * What the member is told about where they stand. The wording carries weight:
 * this is what a lapsed member reads before deciding whether to come back, so
 * it leads with "nothing has been removed".
 */
export function statusLine(
  entitlements: MemberEntitlements,
  now: Date = new Date(),
): { heading: string; detail: string } {
  const trialDays = daysUntil(entitlements.trialEndsAt, now);
  const periodDays = daysUntil(entitlements.currentPeriodEnd, now);
  const plural = (days: number) => (days === 1 ? 'day' : 'days');

  if (!entitlements.fullAccess) {
    return {
      heading: 'Your subscription has lapsed',
      detail:
        'Nothing has been removed. Your records are all still here, and recording — in your '
        + 'Personal budget and any Shared group — is read-only until you subscribe.',
    };
  }

  if (entitlements.status === 'trial') {
    return {
      heading:
        trialDays !== null && trialDays > 0
          ? `${trialDays} ${plural(trialDays)} left in your free period`
          : 'Your free period is ending',
      detail: 'Subscribe any time. Everything keeps working until it ends.',
    };
  }

  if (entitlements.status === 'cancelled') {
    const until = formatDeadline(entitlements.currentPeriodEnd);
    return {
      heading: 'Cancelled',
      detail:
        periodDays !== null && periodDays > 0
          ? `You keep everything for another ${periodDays} ${plural(periodDays)}`
            + (until ? ` — until ${until}.` : '.')
          : 'Your paid period is ending.',
    };
  }

  if (entitlements.status === 'past_due') {
    return {
      heading: 'We could not take your last payment',
      detail: 'Nothing has changed yet. Pay to keep recording.',
    };
  }

  {
    const until = formatDeadline(entitlements.currentPeriodEnd);
    return {
      heading: 'Subscribed',
      detail:
        periodDays !== null
          ? `Your ${entitlements.billingInterval === 'annual' ? 'year' : 'month'} runs for another `
            + `${periodDays} ${plural(periodDays)}`
            + (until ? ` — until ${until}.` : '.')
          : 'Everything is active.',
    };
  }
}

/**
 * A very short label for a settings row or chip — a few words at most, so it
 * never collides with the row's own label. Full wording lives in statusLine.
 */
export function statusChip(entitlements: MemberEntitlements | undefined, now: Date = new Date()): string {
  if (!entitlements) return '—';
  if (!entitlements.fullAccess) return 'Lapsed';
  switch (entitlements.status) {
    case 'trial': {
      const days = daysUntil(entitlements.trialEndsAt, now);
      if (days === null) return 'Free trial';
      if (days <= 0) return 'Trial ends today';
      return `Free trial · ${days}d left`;
    }
    case 'past_due':
      return 'Payment due';
    case 'cancelled':
      return 'Cancelled';
    case 'pending':
      return 'Payment pending';
    case 'active':
      return 'Subscribed';
    default:
      return 'Subscription';
  }
}

/**
 * A short line for the persistent banner — null when there is nothing to say.
 *
 * Shown for the whole trial, not just its last days: mobile has no nav item
 * that can carry "Pay · Nd left" the way the web sidebar does, so this banner
 * is the only place a client on a fresh trial finds out they are on one
 * without having gone looking in Settings.
 */
export function bannerLine(
  entitlements: MemberEntitlements | undefined,
  now: Date = new Date(),
): { text: string; tone: 'info' | 'warn' } | null {
  if (!entitlements) return null;

  if (!entitlements.fullAccess) {
    return { text: 'Subscription lapsed — recording is read-only until you subscribe.', tone: 'warn' };
  }
  if (entitlements.status === 'past_due') {
    return { text: 'Last payment did not go through. Tap to pay.', tone: 'warn' };
  }
  if (entitlements.status === 'trial') {
    const days = daysUntil(entitlements.trialEndsAt, now);
    if (days === null) return null;
    if (days <= 7) {
      return {
        text:
          days > 0
            ? `${days} ${days === 1 ? 'day' : 'days'} left in your free period. Tap to subscribe.`
            : 'Your free period ends today. Tap to subscribe.',
        tone: 'info',
      };
    }
    return {
      text: `You're on a free trial — ${days} days left. Tap to see what's included.`,
      tone: 'info',
    };
  }
  return null;
}
