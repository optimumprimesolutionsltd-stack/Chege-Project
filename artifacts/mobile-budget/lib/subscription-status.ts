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

export function daysUntil(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return null;
  return Math.ceil((end - now.getTime()) / 86_400_000);
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
        'Nothing has been removed. Your records are all still here, and Shared budgets are '
        + 'read-only until you subscribe.',
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
    return {
      heading: 'Cancelled',
      detail:
        periodDays !== null && periodDays > 0
          ? `You keep everything for another ${periodDays} ${plural(periodDays)}.`
          : 'Your paid period is ending.',
    };
  }

  if (entitlements.status === 'past_due') {
    return {
      heading: 'We could not take your last payment',
      detail: 'Nothing has changed yet. Pay to keep your Shared budgets working.',
    };
  }

  return {
    heading: 'Subscribed',
    detail:
      periodDays !== null
        ? `Your ${entitlements.billingInterval === 'annual' ? 'year' : 'month'} runs for another `
          + `${periodDays} ${plural(periodDays)}.`
        : 'Everything is active.',
  };
}

/** A short line for the persistent banner — null when there is nothing to say. */
export function bannerLine(
  entitlements: MemberEntitlements | undefined,
  now: Date = new Date(),
): { text: string; tone: 'info' | 'warn' } | null {
  if (!entitlements) return null;

  if (!entitlements.fullAccess) {
    return { text: 'Subscription lapsed — Shared budgets are read-only. Tap to subscribe.', tone: 'warn' };
  }
  if (entitlements.status === 'past_due') {
    return { text: 'Last payment did not go through. Tap to pay.', tone: 'warn' };
  }
  if (entitlements.status === 'trial') {
    const days = daysUntil(entitlements.trialEndsAt, now);
    if (days !== null && days <= 7) {
      return {
        text:
          days > 0
            ? `${days} ${days === 1 ? 'day' : 'days'} left in your free period. Tap to subscribe.`
            : 'Your free period ends today. Tap to subscribe.',
        tone: 'info',
      };
    }
  }
  return null;
}
