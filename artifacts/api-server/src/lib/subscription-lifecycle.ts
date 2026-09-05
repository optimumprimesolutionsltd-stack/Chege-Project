import { SUBSCRIPTION_STATUS, GRACE_DAYS, type SubscriptionStatus } from "@workspace/jamvi-pricing";

/**
 * What should happen to a subscription today.
 *
 * Kept pure and separate from the job that carries it out, because this is the
 * part worth being sure about: it decides when somebody loses access and when
 * they are told, and both are easy to get subtly wrong in ways nobody notices
 * until a member is upset.
 *
 * Access itself is never decided here — that is computed from the dates on
 * every request, so a member is treated correctly whether or not this job has
 * run. What this adds is the status other things can see, and the warning.
 */

export const REMINDER = {
  /** A week before the free period ends. Early enough to act, late enough to
   *  matter. */
  TRIAL_ENDING_WEEK: "trial_ending_week",
  TRIAL_ENDING_TOMORROW: "trial_ending_tomorrow",
  TRIAL_ENDED: "trial_ended",
  /** STK Push cannot deduct on its own, so a renewal needs the member to act.
   *  Without this nobody would know to. */
  RENEWAL_DUE: "renewal_due",
  PAYMENT_MISSED: "payment_missed",
  /** Last word before a Shared budget goes read-only. */
  GRACE_ENDING: "grace_ending",
} as const;

export type ReminderKind = (typeof REMINDER)[keyof typeof REMINDER];

export interface SubscriptionRow {
  id: number;
  userId: string;
  status: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
}

export interface Transition {
  status: SubscriptionStatus;
  graceEndsAt?: Date | null;
}

export interface Plan {
  transition: Transition | null;
  reminders: Array<{ kind: ReminderKind; dueFor: Date }>;
}

const DAY_MS = 86_400_000;

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / DAY_MS);
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

/**
 * Decides today's transition and any reminder now due.
 *
 * At most one reminder per run. A member who has been away for a fortnight
 * should not open their inbox to a stack of increasingly urgent notices about
 * the same lapse — the most relevant one is enough, and the rest read as
 * nagging.
 */
export function planFor(subscription: SubscriptionRow, now: Date = new Date()): Plan {
  const reminders: Plan["reminders"] = [];

  switch (subscription.status) {
    case SUBSCRIPTION_STATUS.TRIAL: {
      const endsAt = subscription.trialEndsAt;
      if (!endsAt) return { transition: null, reminders };

      if (now >= endsAt) {
        return {
          transition: { status: SUBSCRIPTION_STATUS.EXPIRED },
          reminders: [{ kind: REMINDER.TRIAL_ENDED, dueFor: endsAt }],
        };
      }

      const daysLeft = daysBetween(now, endsAt);
      if (daysLeft <= 1) {
        reminders.push({ kind: REMINDER.TRIAL_ENDING_TOMORROW, dueFor: endsAt });
      } else if (daysLeft <= 7) {
        reminders.push({ kind: REMINDER.TRIAL_ENDING_WEEK, dueFor: endsAt });
      }
      return { transition: null, reminders };
    }

    case SUBSCRIPTION_STATUS.ACTIVE: {
      const endsAt = subscription.currentPeriodEnd;
      if (!endsAt) return { transition: null, reminders };

      if (now >= endsAt) {
        // Into grace rather than straight out. A failed deduction is not a
        // decision to leave, and this is the difference between the two.
        return {
          transition: {
            status: SUBSCRIPTION_STATUS.PAST_DUE,
            graceEndsAt: addDays(now, GRACE_DAYS),
          },
          reminders: [{ kind: REMINDER.PAYMENT_MISSED, dueFor: endsAt }],
        };
      }

      if (daysBetween(now, endsAt) <= 3) {
        reminders.push({ kind: REMINDER.RENEWAL_DUE, dueFor: endsAt });
      }
      return { transition: null, reminders };
    }

    case SUBSCRIPTION_STATUS.PAST_DUE: {
      const graceEndsAt = subscription.graceEndsAt;
      if (!graceEndsAt) {
        // Past due with no grace recorded is a row an older code path left
        // behind. Give it the window rather than expiring somebody early.
        return {
          transition: {
            status: SUBSCRIPTION_STATUS.PAST_DUE,
            graceEndsAt: addDays(now, GRACE_DAYS),
          },
          reminders,
        };
      }

      if (now >= graceEndsAt) {
        return { transition: { status: SUBSCRIPTION_STATUS.EXPIRED }, reminders };
      }
      if (daysBetween(now, graceEndsAt) <= 1) {
        reminders.push({ kind: REMINDER.GRACE_ENDING, dueFor: graceEndsAt });
      }
      return { transition: null, reminders };
    }

    case SUBSCRIPTION_STATUS.CANCELLED: {
      const endsAt = subscription.currentPeriodEnd;
      if (endsAt && now >= endsAt) {
        // Already chose to leave, so no grace and no reminder. Chasing
        // somebody who cancelled deliberately is the fastest way to be marked
        // as spam.
        return { transition: { status: SUBSCRIPTION_STATUS.EXPIRED }, reminders };
      }
      return { transition: null, reminders };
    }

    default:
      return { transition: null, reminders };
  }
}
