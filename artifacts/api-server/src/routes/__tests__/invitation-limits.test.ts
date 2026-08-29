/**
 * Behaviour tests for the member cap and inherited contribution target, at the
 * route rather than in the helpers.
 *
 * The helpers already have unit tests, but those pass whether or not any route
 * calls them. Work on this repository has repeatedly been reverted by edits
 * made from a stale copy of the workspace, and a route quietly losing its
 * capacity check is exactly the kind of regression that leaves every existing
 * test green.
 *
 * So these assert what a person experiences: a full workspace refuses the next
 * member, and someone joining a group with a contribution target inherits it.
 */

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { FREE_MEMBER_LIMIT } from "../../lib/membership-limits.js";

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
 * the plan and member count for the capacity check, then the group's default
 * contribution target.
 */
function acceptanceWhere({
  plan,
  memberCount,
  defaultMonthlyTarget = null,
}: {
  plan: string;
  memberCount: number;
  defaultMonthlyTarget?: number | null;
}) {
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
    [{ plan }],
    [{ count: memberCount }],
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

describe("accepting an invitation respects the member cap", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses to add anyone once a free workspace is full", async () => {
    const { inserted } = acceptanceWhere({ plan: "free", memberCount: FREE_MEMBER_LIMIT });

    const response = await accept();

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/full/i);
    // The important half: nobody is added.
    expect(inserted).not.toHaveBeenCalled();
  });

  it("admits someone while a place remains", async () => {
    const { inserted } = acceptanceWhere({ plan: "free", memberCount: FREE_MEMBER_LIMIT - 1 });

    const response = await accept();

    expect(response.status).toBe(200);
    expect(inserted).toHaveBeenCalled();
  });

  it("does not cap a paid workspace", async () => {
    const { inserted } = acceptanceWhere({ plan: "paid", memberCount: FREE_MEMBER_LIMIT + 40 });

    const response = await accept();

    expect(response.status).toBe(200);
    expect(inserted).toHaveBeenCalled();
  });
});

describe("a new member inherits the group's contribution target", () => {
  beforeEach(() => vi.clearAllMocks());

  it("carries the group's figure onto the membership", async () => {
    const { inserted } = acceptanceWhere({
      plan: "free",
      memberCount: 2,
      defaultMonthlyTarget: 5_000,
    });

    await accept();

    expect(inserted).toHaveBeenCalledWith(
      expect.objectContaining({ monthlyTarget: 5_000 }),
    );
  });

  it("leaves the target unset for a group that has none", async () => {
    const { inserted } = acceptanceWhere({
      plan: "free",
      memberCount: 2,
      defaultMonthlyTarget: null,
    });

    await accept();

    expect(inserted).toHaveBeenCalledWith(
      expect.objectContaining({ monthlyTarget: null }),
    );
  });
});
