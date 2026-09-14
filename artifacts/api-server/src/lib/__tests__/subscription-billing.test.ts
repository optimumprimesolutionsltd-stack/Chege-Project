/**
 * Period arithmetic, promo pricing, and activating a paid period.
 *
 * These decide what somebody is charged and how long it buys them, so the
 * cases worth writing down are the ones where a plausible implementation
 * quietly takes days or money that were not owed.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { BILLING_INTERVAL, SUBSCRIPTION_STATUS } from "@workspace/jamvi-pricing";

// `selectRows.current` is the full set of rows on hand; `allowedStatuses` is
// captured from whatever activateSubscription passes to inArray(). The
// `.where()` mock below filters one against the other, so these tests
// exercise the real status filter instead of just the code that runs after a
// row is already found - the exact gap that let an EXPIRED row go unseen
// here (mirroring the same bug already found and fixed in
// resolveMemberEntitlements).
const { selectRows, allowedStatuses, updateSet, insertValues } = vi.hoisted(() => ({
  selectRows: { current: [] as Array<{ id: number; status: string; currentPeriodEnd: Date | null; createdAt: Date }> },
  allowedStatuses: { current: null as string[] | null },
  updateSet: vi.fn((_values: Record<string, unknown>) => undefined),
  insertValues: vi.fn((_values: Record<string, unknown>) => undefined),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
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
      update: () => ({
        set: (values: Record<string, unknown>) => {
          updateSet(values);
          return { where: () => Promise.resolve() };
        },
      }),
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          insertValues(values);
          return Promise.resolve();
        },
      }),
    },
  };
});

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    inArray: (column: unknown, values: string[]) => {
      allowedStatuses.current = values;
      return { inArray: { column, values } };
    },
  };
});

const { activateSubscription, periodEnd } = await import("../subscription-billing");

beforeEach(() => {
  vi.clearAllMocks();
  selectRows.current = [];
  allowedStatuses.current = null;
});

describe("periodEnd", () => {
  it("adds a month for monthly", () => {
    expect(periodEnd(new Date("2026-09-05T12:00:00Z"), BILLING_INTERVAL.MONTHLY))
      .toEqual(new Date("2026-10-05T12:00:00Z"));
  });

  it("adds a year for annual", () => {
    expect(periodEnd(new Date("2026-09-05T12:00:00Z"), BILLING_INTERVAL.ANNUAL))
      .toEqual(new Date("2027-09-05T12:00:00Z"));
  });

  it("carries a 31st into a short month without skipping one", () => {
    // JavaScript rolls 31 January + 1 month into 3 March. What matters is that
    // the member is never left with less than the month they paid for.
    const end = periodEnd(new Date("2026-01-31T12:00:00Z"), BILLING_INTERVAL.MONTHLY);
    expect(end.getTime()).toBeGreaterThan(new Date("2026-02-28T12:00:00Z").getTime());
  });

  it("does not mutate the date it is given", () => {
    // It takes the caller's `now`, which the callback also writes to the
    // payment row. Mutating it would misdate the receipt.
    const from = new Date("2026-09-05T12:00:00Z");
    periodEnd(from, BILLING_INTERVAL.ANNUAL);
    expect(from.toISOString()).toBe("2026-09-05T12:00:00.000Z");
  });

  it("handles a leap day by landing on a real date", () => {
    const end = periodEnd(new Date("2028-02-29T12:00:00Z"), BILLING_INTERVAL.ANNUAL);
    expect(Number.isNaN(end.getTime())).toBe(false);
    expect(end.getUTCFullYear()).toBe(2029);
  });
});

describe("activateSubscription", () => {
  const NOW = new Date("2026-09-14T00:00:00.000Z");

  it("reactivates an EXPIRED row in place, rather than inserting an orphaned second one", () => {
    selectRows.current = [
      { id: 5, status: SUBSCRIPTION_STATUS.EXPIRED, currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"), createdAt: new Date("2026-06-01T00:00:00.000Z") },
    ];

    return activateSubscription({ userId: "user-1", interval: BILLING_INTERVAL.MONTHLY, now: NOW }).then(() => {
      expect(insertValues).not.toHaveBeenCalled();
      expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: SUBSCRIPTION_STATUS.ACTIVE }));
    });
  });

  it("still charges from now, not the expired row's own past date, once it is found", async () => {
    selectRows.current = [
      { id: 5, status: SUBSCRIPTION_STATUS.EXPIRED, currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"), createdAt: new Date("2026-06-01T00:00:00.000Z") },
    ];

    await activateSubscription({ userId: "user-1", interval: BILLING_INTERVAL.MONTHLY, now: NOW });

    // A past currentPeriodEnd must never be read as unused time still owed.
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ currentPeriodEnd: periodEnd(NOW, BILLING_INTERVAL.MONTHLY) }));
  });

  it("extends from unused time still owed on an ACTIVE row, rather than restarting from now", async () => {
    const stillOwedUntil = new Date("2026-10-01T00:00:00.000Z");
    selectRows.current = [
      { id: 7, status: SUBSCRIPTION_STATUS.ACTIVE, currentPeriodEnd: stillOwedUntil, createdAt: new Date("2026-08-01T00:00:00.000Z") },
    ];

    await activateSubscription({ userId: "user-1", interval: BILLING_INTERVAL.MONTHLY, now: NOW });

    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      currentPeriodEnd: periodEnd(stillOwedUntil, BILLING_INTERVAL.MONTHLY),
    }));
  });

  it("inserts a fresh row only when nothing at all exists for this user", async () => {
    selectRows.current = [];

    await activateSubscription({ userId: "user-1", interval: BILLING_INTERVAL.ANNUAL, now: NOW });

    expect(updateSet).not.toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      status: SUBSCRIPTION_STATUS.ACTIVE,
      currentPeriodEnd: periodEnd(NOW, BILLING_INTERVAL.ANNUAL),
    }));
  });
});
