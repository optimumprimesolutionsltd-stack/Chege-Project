/**
 * The member cap decides who has to pay, so it gets tested.
 *
 * The important behaviour is the grandfathering one: a workspace that is
 * already over the limit must keep working and simply stop growing. Nobody is
 * removed by a rule introduced after they joined.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));

vi.mock("@workspace/db", () => ({
  db: { select: mockSelect },
  groupsTable: { id: "groups.id", plan: "groups.plan" },
  groupMembershipsTable: { groupId: "group_memberships.group_id" },
  GROUP_PLAN: { FREE: "free", PAID: "paid" },
}));

import { db } from "@workspace/db";
import { FREE_MEMBER_LIMIT, hasMemberCapacity } from "../membership-limits.js";

/** Mimics the drizzle builder: .from().where() is awaitable, and .limit() ends it. */
function chain(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  c.from = vi.fn(() => c);
  c.where = vi.fn(() => c);
  c.limit = vi.fn(() => Promise.resolve(rows));
  c.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve);
  return c;
}

/** First select returns the group's plan, second returns the member count. */
function given(plan: string | null, memberCount: number) {
  mockSelect
    .mockReturnValueOnce(chain(plan === null ? [] : [{ plan }]))
    .mockReturnValueOnce(chain([{ count: memberCount }]));
}

describe("hasMemberCapacity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows a free workspace with room to spare", async () => {
    given("free", FREE_MEMBER_LIMIT - 2);
    await expect(hasMemberCapacity(db, 1)).resolves.toBe(true);
  });

  it("allows the very last place", async () => {
    given("free", FREE_MEMBER_LIMIT - 1);
    await expect(hasMemberCapacity(db, 1)).resolves.toBe(true);
  });

  it("refuses once a free workspace is exactly full", async () => {
    given("free", FREE_MEMBER_LIMIT);
    await expect(hasMemberCapacity(db, 1)).resolves.toBe(false);
  });

  it("refuses to grow a workspace that is already over the limit, rather than throwing", async () => {
    // Grandfathering: a group that predates the cap keeps working. It just
    // cannot add anyone, and nothing here removes an existing member.
    given("free", FREE_MEMBER_LIMIT + 10);
    await expect(hasMemberCapacity(db, 1)).resolves.toBe(false);
  });

  it("does not cap a paid workspace", async () => {
    given("paid", FREE_MEMBER_LIMIT + 50);
    await expect(hasMemberCapacity(db, 1)).resolves.toBe(true);
  });

  it("leaves a missing group to the caller's own error handling", async () => {
    given(null, 0);
    await expect(hasMemberCapacity(db, 999)).resolves.toBe(true);
  });
});
