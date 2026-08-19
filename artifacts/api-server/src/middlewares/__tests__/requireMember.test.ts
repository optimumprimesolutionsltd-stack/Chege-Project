import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const legacyMemberIds = new Set<string>();
const memberships = new Map<string, { groupId: number; role: string }>();
let groupExists = false;

const groupsTable = { id: "groups.id", legacyKey: "groups.legacy_key" };
const membersTable = {
  userId: "members.user_id",
  groupId: "members.group_id",
  addedByUserId: "members.added_by_user_id",
  addedAt: "members.added_at",
  monthlyTarget: "members.monthly_target",
};
const groupMembershipsTable = {
  groupId: "group_memberships.group_id",
  userId: "group_memberships.user_id",
  role: "group_memberships.role",
};
const simpleTable = {};

function selectQuery(fields: Record<string, unknown>) {
  let table: object;
  let filter: unknown;
  const rows = () => {
    if (table === groupMembershipsTable) {
      const membership = typeof filter === "string" ? memberships.get(filter) : undefined;
      return membership ? [membership] : [];
    }
    if (table === groupsTable) {
      return "count" in fields
        ? [{ count: groupExists ? 1 : 0 }]
        : groupExists
          ? [{ id: 1 }]
          : [];
    }
    if (table === membersTable) {
      if (typeof filter === "string") {
        return legacyMemberIds.has(filter) ? [{ userId: filter }] : [];
      }
      return [...legacyMemberIds].map((userId) => ({
        userId,
        addedByUserId: null,
        addedAt: new Date(),
        monthlyTarget: null,
      }));
    }
    return [];
  };
  const query = {
    from(value: object) {
      table = value;
      return query;
    },
    where(value: unknown) {
      filter = value;
      return query;
    },
    innerJoin() {
      return query;
    },
    orderBy: async () => rows(),
    limit: async () => rows().slice(0, 1),
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(rows()).then(resolve, reject);
    },
  };
  return query;
}

function insertQuery(table: object) {
  return {
    values: (value: Record<string, unknown> | Record<string, unknown>[]) => {
      if (table === groupsTable) groupExists = true;
      if (table === membersTable && !Array.isArray(value)) {
        legacyMemberIds.add(value.userId as string);
      }
      if (table === groupMembershipsTable) {
        for (const member of Array.isArray(value) ? value : [value]) {
          memberships.set(member.userId as string, {
            groupId: member.groupId as number,
            role: member.role as string,
          });
        }
      }
      return { onConflictDoNothing: vi.fn(async () => undefined) };
    },
  };
}

const tx = {
  execute: vi.fn(async () => undefined),
  select: vi.fn(selectQuery),
  insert: vi.fn(insertQuery),
  update: vi.fn(() => ({
    set: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
  })),
};

const db = {
  transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
};

vi.mock("@workspace/db", () => ({
  db,
  groupsTable,
  membersTable,
  groupMembershipsTable,
  budgetCategoriesTable: simpleTable,
  contributionsTable: simpleTable,
  digestSendsTable: simpleTable,
  expenseIncomeSplitsTable: simpleTable,
  expensesTable: simpleTable,
  incomeSourcesTable: simpleTable,
  jointAccountDepositSplitsTable: simpleTable,
  jointAccountTxTable: simpleTable,
  savingsGoalContributionsTable: simpleTable,
  savingsGoalsTable: simpleTable,
  usersTable: simpleTable,
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions) => conditions.at(-1)),
  asc: vi.fn(),
  eq: vi.fn((_column, value: unknown) => value),
  isNull: vi.fn(),
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
  const res = { status: vi.fn(), json: vi.fn() };
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
  app.get("/protected", (req, res) => res.status(200).json({ groupId: (req as any).group.id }));
  return app;
}

describe("requireMember", () => {
  beforeEach(() => {
    legacyMemberIds.clear();
    memberships.clear();
    groupExists = false;
    vi.clearAllMocks();
  });

  it("adopts the first authenticated member into the initial shared group", async () => {
    const req = authenticatedRequest("first-member");
    const next = vi.fn();

    await requireMember(req, response(), next);

    expect(next).toHaveBeenCalledOnce();
    expect(legacyMemberIds.has("first-member")).toBe(true);
    expect(req.group).toEqual({ id: 1, role: "owner" });
  });

  it("reuses an existing group membership without re-adopting the ledger", async () => {
    groupExists = true;
    memberships.set("owner", { groupId: 1, role: "owner" });
    const req = authenticatedRequest("owner");

    await requireMember(req, response(), vi.fn());

    expect(req.group).toEqual({ id: 1, role: "owner" });
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("does not recreate a removed member after a group already exists", async () => {
    groupExists = true;
    const res = response();

    await requireMember(authenticatedRequest("removed-member"), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "You are not a member of this shared group." }),
    );
    expect(legacyMemberIds.has("removed-member")).toBe(false);
  });

  it("returns 403 for a removed member's next protected request", async () => {
    groupExists = true;

    const res = await request(protectedApp("removed-member")).get("/protected");

    expect(res.status).toBe(403);
    expect(legacyMemberIds.has("removed-member")).toBe(false);
  });
});