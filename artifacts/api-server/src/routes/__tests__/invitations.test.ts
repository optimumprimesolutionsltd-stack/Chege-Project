import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@replit/connectors-sdk", () => ({
  ReplitConnectors: class {
    proxy = vi.fn();
  },
}));

vi.mock("@workspace/db", () => {
  const table = (name: string) => new Proxy({}, {
    get: (_, property) => ({ _table: name, _column: String(property) }),
  });
  return {
    db: { select: vi.fn(), transaction: vi.fn() },
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

function configureAcceptance(invite: Record<string, unknown>, signedInEmail: string) {
  const txSelectResults = [
    [{ id: 7, name: "Test group" }],
    [invite],
    [{ email: signedInEmail }],
    [],
    [{ count: 1 }],
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

  it("creates the invited role when the signed-in email matches", async () => {
    const { inserted, updated } = configureAcceptance(invitation(), "Member@Example.com");

    const response = await request(appFor()).post(`/group-invitations/accept/${"a".repeat(64)}`);

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
});