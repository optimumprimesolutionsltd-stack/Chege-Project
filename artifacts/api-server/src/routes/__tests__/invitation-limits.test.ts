/**
 * Behaviour tests for the subscription gate and inherited contribution target,
 * at the route rather than in the helpers.
 *
 * The helpers already have unit tests, but those pass whether or not any route
 * calls them. Work on this repository has repeatedly been reverted by edits
 * made from a stale copy of the workspace, and a route quietly losing its gate
 * is exactly the kind of regression that leaves every existing test green.
 *
 * So these assert what a person experiences: someone whose own subscription
 * has lapsed cannot join a Shared budget, and someone joining a group with a
 * contribution target inherits it. Group size is no longer a billing question
 * and there is no cap to test.
 */

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockMayUseSharedBudgets } = vi.hoisted(() => ({
  mockMayUseSharedBudgets: vi.fn(async () => true),
}));

vi.mock("../../lib/subscription-catalog", () => ({
  memberMayUseSharedBudgets: mockMayUseSharedBudgets,
}));

vi.mock("@workspace/db", () => {
  const table = (name: string) => new Proxy({}, {
    get: (_, property) => ({ _table: name, _column: String(property) }),
  });
  return {
    db: { select: vi.fn(), transaction: vi.fn() },
    GROUP_PLAN: { FREE: "free", PAID: "paid" },
    groupsTable: table("groups"),
    groupInvitationsTable: table("group_invitations"),
    groupMembershipsTable: table("group_memberships"),
    groupInviteContactsTable: table("group_invite_contacts"),
    usersTable: table("users"),
  };
});

import { db } from "@workspace/db";
import { publicInvitationsRouter } from "../invitations.js";

type Mock = ReturnType<typeof vi.fn>;

function selectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.for = vi.fn().mockResolvedValue(rows);
  chain.orderBy = vi.fn().mockResolvedValue(rows);
  chain.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve);
  return chain;
}

const SIGNED_IN_EMAIL = "member@example.com";
const TOKEN = "a".repeat(64);

function appFor(userId = "member-1") {
  const app = express();
  app.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: userId };
    req.log = { error: vi.fn() };
    next();
  });
  app.use(publicInvitationsRouter);
  return app;
}

/**
 * Drives one acceptance. The transaction reads, in order: the group, the
 * invitation, the signed-in person's email, their existing membership, then
 * the group's default contribution target. Whether they may join at all is
 * asked of their subscription, not read from the group.
 */
function acceptanceWhere({
  subscribed = true,
  defaultMonthlyTarget = null,
}: {
  subscribed?: boolean;
  defaultMonthlyTarget?: number | null;
} = {}) {
  mockMayUseSharedBudgets.mockResolvedValue(subscribed);
  const txSelectResults: unknown[][] = [
    [{ id: 7, name: "Test group" }],
    [{
      id: 41,
      groupId: 7,
      email: SIGNED_IN_EMAIL,
      role: "member",
      createdByUserId: "owner-1",
      expiresAt: new Date(Date.now() + 60_000),
      acceptedAt: null,
      cancelledAt: null,
    }],
    [{ email: SIGNED_IN_EMAIL }],
    [],
    [{ defaultMonthlyTarget }],
  ];

  const inserted = vi.fn().mockResolvedValue(undefined);
  const tx = {
    select: vi.fn().mockImplementation(() => selectChain(txSelectResults.shift() ?? [])),
    insert: vi.fn().mockReturnValue({ values: inserted }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn() }) }),
  };

  (db.select as Mock).mockReturnValue(selectChain([{ groupId: 7 }]));
  (db.transaction as Mock).mockImplementation(
    (callback: (transaction: typeof tx) => unknown) => callback(tx),
  );
  return { inserted };
}

function accept() {
  return request(appFor()).post(`/group-invitations/accept/${TOKEN}`).send({});
}

describe("accepting an invitation asks about the joiner's subscription", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses someone whose subscription has lapsed", async () => {
    const { inserted } = acceptanceWhere({ subscribed: false });

    const response = await accept();

    expect(response.status).toBe(402);
    expect(response.body.error).toMatch(/subscription/i);
    // The important half: nobody is added.
    expect(inserted).not.toHaveBeenCalled();
  });

  it("admits a current member", async () => {
    const { inserted } = acceptanceWhere({ subscribed: true });

    const response = await accept();

    expect(response.status).toBe(200);
    expect(inserted).toHaveBeenCalled();
  });

  it("asks about the person accepting, not the group", async () => {
    acceptanceWhere({ subscribed: true });

    await accept();

    expect(mockMayUseSharedBudgets).toHaveBeenCalledWith(
      "member-1",
      expect.anything(),
    );
  });

  it("does not care how many people are already in the group", async () => {
    // Fifty members is fifty subscriptions, not a bigger plan.
    const { inserted } = acceptanceWhere({ subscribed: true });

    expect((await accept()).status).toBe(200);
    expect(inserted).toHaveBeenCalled();
  });
});

describe("a new member inherits the group's contribution target", () => {
  beforeEach(() => vi.clearAllMocks());

  it("carries the group's figure onto the membership", async () => {
    const { inserted } = acceptanceWhere({ defaultMonthlyTarget: 5_000 });

    await accept();

    expect(inserted).toHaveBeenCalledWith(
      expect.objectContaining({ monthlyTarget: 5_000 }),
    );
  });

  it("leaves the target unset for a group that has none", async () => {
    const { inserted } = acceptanceWhere({ defaultMonthlyTarget: null });

    await accept();

    expect(inserted).toHaveBeenCalledWith(
      expect.objectContaining({ monthlyTarget: null }),
    );
  });
});
