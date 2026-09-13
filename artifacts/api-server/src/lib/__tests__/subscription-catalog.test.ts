/**
 * resolveMemberEntitlements — the one query every paywall gate in the app
 * (requireTransactionEligibility, requireInviteEligibility, the members.ts
 * join check) ultimately calls.
 *
 * Found while setting up a test account to verify tonight's paywall fixes:
 * the query only selects rows whose status is in `liveStatuses`, and EXPIRED
 * was not in that list. A subscription the nightly lifecycle job has already
 * moved to EXPIRED therefore becomes invisible to this query - it comes back
 * with no row at all, which every caller's own carve-out logic
 * ("no row = predates subscriptions, never lock out") then reads as "this
 * account never had a subscription," restoring full access instead of
 * denying it. A trial or past-due row past its date is still correctly
 * caught by the date check below, since it has not been relabelled EXPIRED
 * yet - so this gap only opens once the lifecycle job actually runs, which
 * is exactly the state a truly lapsed test account ends up in.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// `selectRows.current` is the full set of rows actually stored for this user;
// `allowedStatuses` is captured from whatever the code under test passes to
// inArray(). The `.where()` mock below filters one against the other, so
// this test exercises the real query's status filter instead of just the
// code that runs after a row is already found - a mock that always returns
// `selectRows.current` unfiltered would pass even with the bug this test
// exists to catch.
const { selectRows, allowedStatuses } = vi.hoisted(() => ({
  selectRows: { current: [] as Array<{ status: string }> },
  allowedStatuses: { current: null as string[] | null },
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () =>
              Promise.resolve(
                allowedStatuses.current === null
                  ? selectRows.current
                  : selectRows.current.filter((row) => allowedStatuses.current!.includes(row.status)),
              ),
          }),
        }),
      }),
    }),
  },
  userSubscriptionsTable: new Proxy({}, { get: (_, prop) => ({ _col: String(prop) }) }),
  subscriptionPlansTable: {},
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...clauses: unknown[]) => ({ and: clauses })),
  desc: vi.fn((column: unknown) => column),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  inArray: vi.fn((column: unknown, values: string[]) => {
    allowedStatuses.current = values;
    return { inArray: { column, values } };
  }),
}));

const { resolveMemberEntitlements } = await import("../subscription-catalog");

function row(overrides: Record<string, unknown> = {}) {
  return {
    packageCode: "JAMVI",
    status: "active",
    billingInterval: "monthly",
    trialEndsAt: null,
    currentPeriodEnd: null,
    graceEndsAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  selectRows.current = [];
  allowedStatuses.current = null;
});

describe("resolveMemberEntitlements", () => {
  it("grants full access for an active subscription within its period", async () => {
    const future = new Date(Date.now() + 30 * 86_400_000);
    selectRows.current = [row({ status: "active", currentPeriodEnd: future })];

    const result = await resolveMemberEntitlements("user-1");

    expect(result.fullAccess).toBe(true);
    expect(result.status).toBe("active");
  });

  it("denies access for a trial past its end date, even before the lifecycle job relabels it", async () => {
    const past = new Date(Date.now() - 86_400_000);
    selectRows.current = [row({ status: "trial", trialEndsAt: past })];

    const result = await resolveMemberEntitlements("user-1");

    expect(result.fullAccess).toBe(false);
    expect(result.status).toBe("trial");
  });

  it("denies access for a subscription the lifecycle job has already marked EXPIRED", async () => {
    selectRows.current = [row({ status: "expired", trialEndsAt: new Date(Date.now() - 30 * 86_400_000) })];

    const result = await resolveMemberEntitlements("user-1");

    expect(result.fullAccess).toBe(false);
    // Must not be null: null is the "never had a subscription" signal every
    // caller uses to skip locking somebody out. Collapsing a genuinely
    // expired row into that signal is what silently un-blocks them.
    expect(result.status).not.toBeNull();
  });

  it("still reports no access, and a null status, for an account with no subscription row at all", async () => {
    selectRows.current = [];

    const result = await resolveMemberEntitlements("user-1");

    expect(result.fullAccess).toBe(false);
    expect(result.status).toBeNull();
  });
});
