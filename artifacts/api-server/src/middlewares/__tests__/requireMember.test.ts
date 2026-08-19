import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const activeMemberIds = new Set<string>();

const db = {
  query: {
    membersTable: {
      findFirst: vi.fn(async ({ where }: { where: { value: string } }) =>
        activeMemberIds.has(where.value) ? { userId: where.value } : undefined,
      ),
    },
  },
  select: vi.fn(() => ({
    from: vi.fn(async () => [{ count: activeMemberIds.size }]),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(({ userId }: { userId: string }) => ({
      onConflictDoNothing: vi.fn(async () => {
        activeMemberIds.add(userId);
      }),
    })),
  })),
};

vi.mock("@workspace/db", () => ({
  db,
  membersTable: { userId: "user_id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_column, value: string) => ({ value })),
  sql: vi.fn(),
}));

const { requireMember } = await import("../requireMember.js");

function authenticatedRequest(userId: string) {
  return {
    isAuthenticated: () => true,
    user: { id: userId },
  } as any;
}

function response() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res as any;
}

function protectedApp(userId: string) {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => true;
    (req as any).user = { id: userId };
    next();
  });
  app.use(requireMember);
  app.get("/protected", (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe("requireMember", () => {
  beforeEach(() => {
    activeMemberIds.clear();
    activeMemberIds.add("owner");
    vi.clearAllMocks();
  });

  it("allows an active household member", async () => {
    const next = vi.fn();

    await requireMember(authenticatedRequest("owner"), response(), next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("starts an empty household with its first authenticated member", async () => {
    activeMemberIds.clear();
    const next = vi.fn();

    await requireMember(authenticatedRequest("first-member"), response(), next);

    expect(next).toHaveBeenCalledOnce();
    expect(activeMemberIds.has("first-member")).toBe(true);
  });

  it("does not recreate a removed member when they authenticate again", async () => {
    activeMemberIds.add("removed-member");
    activeMemberIds.delete("removed-member");
    const res = response();

    await requireMember(authenticatedRequest("removed-member"), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "You are not a member of this household." }),
    );
    expect(activeMemberIds.has("removed-member")).toBe(false);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns 403 for a removed member's next protected request", async () => {
    activeMemberIds.add("removed-member");
    activeMemberIds.delete("removed-member");

    const res = await request(protectedApp("removed-member")).get("/protected");

    expect(res.status).toBe(403);
    expect(activeMemberIds.has("removed-member")).toBe(false);
    expect(db.insert).not.toHaveBeenCalled();
  });
});