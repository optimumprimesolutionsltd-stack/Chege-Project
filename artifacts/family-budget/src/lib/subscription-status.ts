export type SubscriptionStatusCode =
  | "trial"
  | "pending"
  | "active"
  | "past_due"
  | "cancelled"
  | "expired";

export interface MemberEntitlements {
  packageCode: string | null;
  packageName: string;
  fullAccess: boolean;
  status: SubscriptionStatusCode | null;
  billingInterval: "monthly" | "annual" | null;
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
 * What the member is told about where they stand.
 *
 * Extracted from the page because the wording carries real weight: this is the
 * screen a lapsed member reads before deciding whether to come back. Someone
 * who reads "your data has been removed" does not.
 */
export function statusLine(
  entitlements: MemberEntitlements,
  now: Date = new Date(),
): { heading: string; detail: string } {
  const trialDays = daysUntil(entitlements.trialEndsAt, now);
  const periodDays = daysUntil(entitlements.currentPeriodEnd, now);
  const plural = (days: number) => (days === 1 ? "day" : "days");

  // Checked before status, because what a lapsed member needs to know is not
  // which state they are in but that nothing has been lost.
  if (!entitlements.fullAccess) {
    return {
      heading: "Your subscription has lapsed",
      detail:
        "Nothing has been removed. Your records are all still here, and Shared budgets are "
        + "read-only until you subscribe.",
    };
  }

  if (entitlements.status === "trial") {
    return {
      heading: trialDays !== null && trialDays > 0
        ? `${trialDays} ${plural(trialDays)} left in your free period`
        : "Your free period is ending",
      detail: "Subscribe any time. Everything keeps working until it ends.",
    };
  }

  if (entitlements.status === "cancelled") {
    return {
      heading: "Cancelled",
      detail: periodDays !== null && periodDays > 0
        ? `You keep everything for another ${periodDays} ${plural(periodDays)}.`
        : "Your paid period is ending.",
    };
  }

  if (entitlements.status === "past_due") {
    return {
      heading: "We could not take your last payment",
      detail: "Nothing has changed yet. Pay to keep your Shared budgets working.",
    };
  }

  return {
    heading: "Subscribed",
    detail: periodDays !== null
      ? `Your ${entitlements.billingInterval === "annual" ? "year" : "month"} runs for another `
        + `${periodDays} ${plural(periodDays)}.`
      : "Everything is active.",
  };
}
