/**
 * Whether a member may take part in Shared budgets.
 *
 * This file used to test a six-person cap on free workspaces. Jamvi is now
 * bought per member and groups cost nothing, so group size is not a billing
 * question and there is no cap left to test. What matters instead is the
 * boundary between paying and lapsed — and specifically that it is read from
 * the subscription's own dates.
 *
 * That is the part worth guarding. Nothing moves the status column yet: there
 * is no billing job, no payment integration. If access were decided by status
 * alone, a trial that ended in March would still grant everything in June.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));

vi.mock("@workspace/db", () => ({
  db: { select: mockSelect },
  subscriptionPlansTable: { code: "subscription_plans.code", enabled: "subscription_plans.enabled" },
  userSubscriptionsTable: {
    id: "user_subscriptions.id",
    userId: "user_subscriptions.user_id",
    packageCode: "user_subscriptions.package_code",
    status: "user_subscriptions.status",
    billingInterval: "user_subscriptions.billing_interval",
    trialEndsAt: "user_subscriptions.trial_ends_at",
    currentPeriodEnd: "user_subscriptions.current_period_end",
    graceEndsAt: "user_subscriptions.grace_ends_at",
    createdAt: "user_subscriptions.created_at",
  },
}));

import { db } from "@workspace/db";
import { ENTITLEMENT, PACKAGE_CODE, SUBSCRIPTION_STATUS } from "@workspace/jamvi-pricing";
import { resolveMemberEntitlements } from "../subscription-catalog";

/** Mimics the drizzle builder: .from().where().orderBy().limit() resolves. */
function chain(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  c.from = vi.fn(() => c);
  c.where = vi.fn(() => c);
  c.orderBy = vi.fn(() => c);
  c.limit = vi.fn(() => Promise.resolve(rows));
  return c;
}

const NOW = new Date("2026-09-04T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function subscription(overrides: Record<string, unknown>) {
  return {
    packageCode: PACKAGE_CODE.JAMVI,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    billingInterval: "monthly",
    trialEndsAt: null,
    currentPeriodEnd: null,
    graceEndsAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveMemberEntitlements", () => {
  it("grants everything during a trial that has not run out", async () => {
    mockSelect.mockReturnValueOnce(chain([
      subscription({ status: SUBSCRIPTION_STATUS.TRIAL, trialEndsAt: days(9) }),
    ]));

    const result = await resolveMemberEntitlements("user-1", db, NOW);

    expect(result.fullAccess).toBe(true);
    expect(result.featureFlags).toContain(ENTITLEMENT.SHARED_GROUP_ACCESS);
  });

  it("lapses a trial whose date has passed, even though nothing moved the status", async () => {
    mockSelect.mockReturnValueOnce(chain([
      subscription({ status: SUBSCRIPTION_STATUS.TRIAL, trialEndsAt: days(-1) }),
    ]));

    const result = await resolveMemberEntitlements("user-1", db, NOW);

    expect(result.fullAccess).toBe(false);
    expect(result.featureFlags).not.toContain(ENTITLEMENT.SHARED_GROUP_ACCESS);
    expect(result.featureFlags).toContain(ENTITLEMENT.PERSONAL_EXPENSES);
  });

  it("carries a missed payment through the grace window", async () => {
    mockSelect.mockReturnValueOnce(chain([
      subscription({ status: SUBSCRIPTION_STATUS.PAST_DUE, graceEndsAt: days(3) }),
    ]));

    expect((await resolveMemberEntitlements("user-1", db, NOW)).fullAccess).toBe(true);
  });

  it("drops to read-only once the grace window closes", async () => {
    mockSelect.mockReturnValueOnce(chain([
      subscription({ status: SUBSCRIPTION_STATUS.PAST_DUE, graceEndsAt: days(-1) }),
    ]));

    expect((await resolveMemberEntitlements("user-1", db, NOW)).fullAccess).toBe(false);
  });

  it("honours a cancellation to the end of the period already paid for", async () => {
    mockSelect.mockReturnValueOnce(chain([
      subscription({ status: SUBSCRIPTION_STATUS.CANCELLED, currentPeriodEnd: days(12) }),
    ]));

    expect((await resolveMemberEntitlements("user-1", db, NOW)).fullAccess).toBe(true);
  });

  it("treats a member with no subscription as lapsed, not as an error", async () => {
    mockSelect.mockReturnValueOnce(chain([]));

    const result = await resolveMemberEntitlements("user-1", db, NOW);

    expect(result.fullAccess).toBe(false);
    expect(result.status).toBeNull();
    expect(result.packageCode).toBeNull();
  });

  it("keeps a lapsed member's own records reachable", async () => {
    // The lapsed state is where every non-payer lives, so it has to stay
    // usable enough to come back to.
    mockSelect.mockReturnValueOnce(chain([
      subscription({ status: SUBSCRIPTION_STATUS.TRIAL, trialEndsAt: days(-30) }),
    ]));

    const { featureFlags } = await resolveMemberEntitlements("user-1", db, NOW);

    expect(featureFlags).toContain(ENTITLEMENT.PERSONAL_INCOME);
    expect(featureFlags).toContain(ENTITLEMENT.PERSONAL_EXPENSES);
    expect(featureFlags).not.toContain(ENTITLEMENT.FULL_HISTORY);
  });
});
