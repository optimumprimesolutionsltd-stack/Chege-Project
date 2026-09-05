/**
 * When a subscription moves, and when somebody is told.
 *
 * This decides the day a member loses access and the day they hear about it.
 * Both are easy to get subtly wrong in ways nobody notices until somebody is
 * upset, so the boundaries are pinned rather than assumed.
 */

import { describe, expect, it } from "vitest";
import { SUBSCRIPTION_STATUS, GRACE_DAYS } from "@workspace/jamvi-pricing";
import { REMINDER, planFor, type SubscriptionRow } from "../subscription-lifecycle";

const NOW = new Date("2026-09-05T07:00:00Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function subscription(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: 1,
    userId: "member-1",
    status: SUBSCRIPTION_STATUS.TRIAL,
    trialEndsAt: null,
    currentPeriodEnd: null,
    graceEndsAt: null,
    ...overrides,
  };
}

describe("a trial", () => {
  it("says nothing while there is plenty of time", () => {
    const plan = planFor(subscription({ trialEndsAt: inDays(20) }), NOW);

    expect(plan.transition).toBeNull();
    expect(plan.reminders).toHaveLength(0);
  });

  it("warns a week out", () => {
    const plan = planFor(subscription({ trialEndsAt: inDays(6) }), NOW);

    expect(plan.reminders[0].kind).toBe(REMINDER.TRIAL_ENDING_WEEK);
    expect(plan.transition).toBeNull();
  });

  it("warns again the day before, and only once", () => {
    // Not both notices in the same run: a member should not open their inbox
    // to a stack of increasingly urgent mail about the same lapse.
    const plan = planFor(subscription({ trialEndsAt: inDays(1) }), NOW);

    expect(plan.reminders).toHaveLength(1);
    expect(plan.reminders[0].kind).toBe(REMINDER.TRIAL_ENDING_TOMORROW);
  });

  it("expires once the date has passed, and says so", () => {
    const plan = planFor(subscription({ trialEndsAt: inDays(-1) }), NOW);

    expect(plan.transition?.status).toBe(SUBSCRIPTION_STATUS.EXPIRED);
    expect(plan.reminders[0].kind).toBe(REMINDER.TRIAL_ENDED);
  });

  it("leaves a trial with no end date alone", () => {
    // Expiring somebody on missing data would take access nobody agreed to
    // take.
    expect(planFor(subscription({ trialEndsAt: null }), NOW).transition).toBeNull();
  });
});

describe("an active subscription", () => {
  const active = (end: Date) => subscription({
    status: SUBSCRIPTION_STATUS.ACTIVE,
    currentPeriodEnd: end,
  });

  it("asks for renewal a few days out, because M-Pesa cannot take it alone", () => {
    expect(planFor(active(inDays(2)), NOW).reminders[0].kind).toBe(REMINDER.RENEWAL_DUE);
  });

  it("stays quiet earlier in the period", () => {
    expect(planFor(active(inDays(20)), NOW).reminders).toHaveLength(0);
  });

  it("goes to grace when the period runs out, not straight to expired", () => {
    // A failed deduction is not a decision to leave. The grace window is what
    // tells the two apart.
    const plan = planFor(active(inDays(-1)), NOW);

    expect(plan.transition?.status).toBe(SUBSCRIPTION_STATUS.PAST_DUE);
    expect(plan.transition?.graceEndsAt?.getTime())
      .toBe(new Date(NOW.getTime() + GRACE_DAYS * 86_400_000).getTime());
    expect(plan.reminders[0].kind).toBe(REMINDER.PAYMENT_MISSED);
  });
});

describe("a past due subscription", () => {
  const pastDue = (grace: Date | null) => subscription({
    status: SUBSCRIPTION_STATUS.PAST_DUE,
    graceEndsAt: grace,
  });

  it("keeps full access until the grace window closes", () => {
    expect(planFor(pastDue(inDays(3)), NOW).transition).toBeNull();
  });

  it("gives one last warning the day before", () => {
    expect(planFor(pastDue(inDays(1)), NOW).reminders[0].kind).toBe(REMINDER.GRACE_ENDING);
  });

  it("expires once grace is spent", () => {
    expect(planFor(pastDue(inDays(-1)), NOW).transition?.status)
      .toBe(SUBSCRIPTION_STATUS.EXPIRED);
  });

  it("grants a window to a row that somehow has none, rather than expiring it", () => {
    const plan = planFor(pastDue(null), NOW);

    expect(plan.transition?.status).toBe(SUBSCRIPTION_STATUS.PAST_DUE);
    expect(plan.transition?.graceEndsAt).not.toBeNull();
  });
});

describe("a cancelled subscription", () => {
  it("runs to the end of what was paid for", () => {
    const plan = planFor(subscription({
      status: SUBSCRIPTION_STATUS.CANCELLED,
      currentPeriodEnd: inDays(10),
    }), NOW);

    expect(plan.transition).toBeNull();
  });

  it("expires afterwards without chasing them", () => {
    // They chose to leave. Mail asking them to come back is how a sender gets
    // marked as spam.
    const plan = planFor(subscription({
      status: SUBSCRIPTION_STATUS.CANCELLED,
      currentPeriodEnd: inDays(-1),
    }), NOW);

    expect(plan.transition?.status).toBe(SUBSCRIPTION_STATUS.EXPIRED);
    expect(plan.reminders).toHaveLength(0);
  });
});

describe("an already expired subscription", () => {
  it("is left alone, so nothing is re-sent to somebody long gone", () => {
    const plan = planFor(subscription({
      status: SUBSCRIPTION_STATUS.EXPIRED,
      trialEndsAt: inDays(-90),
    }), NOW);

    expect(plan.transition).toBeNull();
    expect(plan.reminders).toHaveLength(0);
  });
});
