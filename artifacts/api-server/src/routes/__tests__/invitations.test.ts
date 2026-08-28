import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => {
  const table = (name: string) => new Proxy({}, {
    get: (_, property) => ({ _table: name, _column: String(property) }),
  });
  return {
    db: { select: vi.fn(), transaction: vi.fn() },
    // Accepting an invitation now checks the workspace has room, which reads
    // the group's plan. Without this the constant is undefined and every
    // acceptance throws.
    GROUP_PLAN: { FREE: "free", PAID: "paid" },
    groupsTable: table("groups"),
    groupInvitationsTable: table("group_invitations"),
    groupMembershipsTable: table("group_memberships"),
    groupInviteContactsTable: table("group_invite_contacts"),
    usersTable: table("users"),
  };
});

import { db } from "@workspace/db";
import { invitationsRouter, publicInvitationsRouter } from "../invitations.js";

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

function invitation(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 41,
    groupId: 7,
    email: "member@example.com",
    role: "admin",
    tokenHash: "hashed",
    createdByUserId: "owner-1",
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    acceptedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

function appFor(userId = "member-1") {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: userId };
    req.log = { error: vi.fn() };
    next();
  });
  app.use(publicInvitationsRouter);
  return app;
}

function managerApp(group: { id: number; role: "owner" | "admin" | "member"; isPrivate: boolean }) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: "manager-1" };
    req.group = group;
    req.log = { error: vi.fn() };
    next();
  });
  app.use(invitationsRouter);
  return app;
}

function configureAcceptance(invite: Record<string, unknown>, signedInEmail: string) {
  const txSelectResults = [
    [{ id: 7, name: "Test group" }],
    [invite],
    [{ email: signedInEmail }],
    [],
    [{ count: 2 }],
  ];
  const inserted = vi.fn().mockResolvedValue(undefined);
  const updated = vi.fn().mockResolvedValue(undefined);
  const tx = {
    select: vi.fn().mockImplementation(() => selectChain(txSelectResults.shift() ?? [])),
    insert: vi.fn().mockReturnValue({ values: inserted }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: updated }) }),
  };
  (db.select as Mock).mockReturnValue(selectChain([{ groupId: 7 }]));
  (db.transaction as Mock).mockImplementation((callback: (transaction: typeof tx) => unknown) => callback(tx));
  return { inserted, updated };
}

describe("group invitation acceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the invited role when the signed-in email matches, even after two members have joined", async () => {
    const { inserted, updated } = configureAcceptance(invitation(), "Member@Example.com");

    const response = await request(appFor())
      .post(`/group-invitations/accept/${"a".repeat(64)}`)
      .send({ groupId: 999 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ groupName: "Test group", role: "admin" });
    expect(inserted).toHaveBeenCalledWith(expect.objectContaining({
      groupId: 7,
      userId: "member-1",
      role: "admin",
      addedByUserId: "owner-1",
    }));
    expect(updated).toHaveBeenCalledOnce();
  });

  it("rejects acceptance when the signed-in email differs from the invitation", async () => {
    const { inserted } = configureAcceptance(invitation(), "someone-else@example.com");

    const response = await request(appFor()).post(`/group-invitations/accept/${"b".repeat(64)}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/email address that received/i);
    expect(inserted).not.toHaveBeenCalled();
  });

  it("rejects an expired invitation before creating membership", async () => {
    const { inserted } = configureAcceptance(
      invitation({ expiresAt: new Date(Date.now() - 1_000) }),
      "member@example.com",
    );

    const response = await request(appFor()).post(`/group-invitations/accept/${"c".repeat(64)}`);

    expect(response.status).toBe(410);
    expect(response.body.error).toMatch(/expired/i);
    expect(inserted).not.toHaveBeenCalled();
  });

  it("cannot replay an already accepted invitation", async () => {
    const { inserted } = configureAcceptance(
      invitation({ acceptedAt: new Date(Date.now() - 1_000) }),
      "member@example.com",
    );

    const response = await request(appFor()).post(`/group-invitations/accept/${"d".repeat(64)}`);

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/already been accepted/i);
    expect(inserted).not.toHaveBeenCalled();
  });
});

describe("group invitation management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets an administrator see invitations for their active shared group", async () => {
    (db.select as Mock).mockReturnValue(selectChain([invitation()]));

    const response = await request(managerApp({
      id: 7,
      role: "admin",
      isPrivate: false,
    })).get("/group-invitations");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({ id: 41, email: "member@example.com", role: "admin", status: "pending" }),
    ]);
  });

  it.each([
    { role: "member" as const, isPrivate: false },
    { role: "owner" as const, isPrivate: true },
  ])("does not expose invitations outside a manager's shared group", async ({ role, isPrivate }) => {
    const response = await request(managerApp({
      id: 7,
      role,
      isPrivate,
    })).get("/group-invitations");

    expect(response.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("rejects a batch containing an invalid email before creating invitations", async () => {
    const response = await request(managerApp({
      id: 7,
      role: "admin",
      isPrivate: false,
    })).post("/group-invitations/batch").send({
      emails: ["valid@example.com", "not-an-email"],
      role: "member",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/valid email/i);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("keeps batch invitations manager-only", async () => {
    const response = await request(managerApp({
      id: 7,
      role: "member",
      isPrivate: false,
    })).post("/group-invitations/batch").send({
      emails: ["one@example.com", "two@example.com"],
      role: "member",
    });

    expect(response.status).toBe(403);
    expect(db.transaction).not.toHaveBeenCalled();
  });
});