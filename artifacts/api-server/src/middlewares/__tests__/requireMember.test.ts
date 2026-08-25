import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const legacyMemberIds = new Set<string>();
const persistedUserIds = new Set<string>();
const memberships = new Map<string, Array<{ groupId: number; role: string }>>();
const privateWorkspaceIds = new Map<string, number>();
let groupExists = false;
let nextGroupId = 2;

const groupsTable = {
  id: "groups.id",
  legacyKey: "groups.legacy_key",
  privateOwnerUserId: "groups.private_owner_user_id",
  createdByUserId: "groups.created_by_user_id",
};
const usersTable = { id: "users.id" };
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

type Condition =
  | { kind: "eq"; column: unknown; value: unknown }
  | { kind: "isNull"; column: unknown }
  | { kind: "and"; conditions: Condition[] };

function conditionsOf(condition: unknown): Condition[] {
  if (!condition || typeof condition !== "object") return [];
  const value = condition as Condition;
  return value.kind === "and" ? value.conditions.flatMap(conditionsOf) : [value];
}

function equalValue(condition: unknown, column: unknown) {
  return conditionsOf(condition).find(
    (item): item is Extract<Condition, { kind: "eq" }> =>
      item.kind === "eq" && item.column === column,
  )?.value;
}

function hasNullCheck(condition: unknown, column: unknown) {
  return conditionsOf(condition).some(
    (item) => item.kind === "isNull" && item.column === column,
  );
}

function selectQuery(fields: Record<string, unknown>) {
  let table: object;
  let filter: unknown;
  const rows = () => {
    if (table === groupMembershipsTable) {
      const userId = equalValue(filter, groupMembershipsTable.userId);
      const userMemberships = typeof userId === "string" ? memberships.get(userId) ?? [] : [];
      const requestedGroupId = equalValue(filter, groupMembershipsTable.groupId);
      const sharedOnly = hasNullCheck(filter, groupsTable.privateOwnerUserId);
      const matchingMemberships = typeof requestedGroupId === "number"
        ? userMemberships.filter((membership) => membership.groupId === requestedGroupId)
        : userMemberships;
      return sharedOnly
        ? matchingMemberships.filter((membership) => ![...privateWorkspaceIds.values()].includes(membership.groupId))
        : matchingMemberships;
    }
    if (table === groupsTable) {
      return "count" in fields
        ? [{ count: groupExists ? 1 : 0 }]
        : (() => {
            const privateOwnerId = equalValue(filter, groupsTable.privateOwnerUserId);
            if (typeof privateOwnerId === "string") {
              const id = privateWorkspaceIds.get(privateOwnerId);
              return id ? [{ id }] : [];
            }
            return groupExists ? [{ id: 1 }] : [];
          })();
    }
    if (table === membersTable) {
      const userId = equalValue(filter, membersTable.userId);
      if (typeof userId === "string") {
        return legacyMemberIds.has(userId) ? [{ userId }] : [];
      }
      return [...legacyMemberIds].map((userId) => ({
        userId,
        addedByUserId: null,
        addedAt: new Date(),
        monthlyTarget: null,
      }));
    }
    if (table === usersTable) {
      const userId = equalValue(filter, usersTable.id);
      return typeof userId === "string" && persistedUserIds.has(userId)
        ? [{ id: userId }]
        : [];
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
      if (table === groupsTable && !Array.isArray(value)) {
        const createdByUserId = value.createdByUserId;
        if (
          typeof createdByUserId === "string" &&
          !persistedUserIds.has(createdByUserId)
        ) {
          throw new Error("groups.created_by_user_id must reference a persisted user");
        }
        groupExists = true;
        if (typeof value.privateOwnerUserId === "string" && !privateWorkspaceIds.has(value.privateOwnerUserId)) {
          privateWorkspaceIds.set(value.privateOwnerUserId, nextGroupId++);
        }
      }
      if (table === membersTable && !Array.isArray(value)) {
        legacyMemberIds.add(value.userId as string);
      }
      if (table === usersTable && !Array.isArray(value)) {
        persistedUserIds.add(value.id as string);
      }
      if (table === groupMembershipsTable) {
        for (const member of Array.isArray(value) ? value : [value]) {
          const userId = member.userId as string;
          if (!persistedUserIds.has(userId)) {
            throw new Error("group_memberships.user_id must reference a persisted user");
          }
          const existing = memberships.get(userId) ?? [];
          existing.push({
            groupId: member.groupId as number,
            role: member.role as string,
          });
          memberships.set(userId, existing);
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
  select: vi.fn(selectQuery),
  insert: vi.fn(insertQuery),
  transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
};

vi.mock("@workspace/db", () => ({
  db,
  // requireMember stamps kind on the private workspace it creates. Without
  // this the constant is undefined and every adoption test throws a 500.
  GROUP_KIND: {
    PERSONAL: "personal",
    FAMILY: "family",
    CHAMA: "chama",
    CLUB: "club",
  },
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
  usersTable,
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions) => ({ kind: "and", conditions })),
  asc: vi.fn(),
  eq: vi.fn((column, value: unknown) => ({ kind: "eq", column, value })),
  isNull: vi.fn((column) => ({ kind: "isNull", column })),
  sql: vi.fn(),
}));

const {
  ACTIVE_WORKSPACE_COOKIE,
  LEGACY_ACTIVE_WORKSPACE_COOKIE,
} = await import("../../lib/activeGroup.js");
const { requireMember } = await import("../requireMember.js");

function authenticatedRequest(userId: string) {
  return {
    isAuthenticated: () => true,
    user: { id: userId },
  } as any;
}

function response() {
  const res = { status: vi.fn(), json: vi.fn(), clearCookie: vi.fn() };
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
    persistedUserIds.clear();
    memberships.clear();
    privateWorkspaceIds.clear();
    groupExists = false;
    nextGroupId = 2;
    vi.clearAllMocks();
  });

  it("adopts the first authenticated member into the initial shared group", async () => {
    const req = authenticatedRequest("first-member");
    const next = vi.fn();

    await requireMember(req, response(), next);

    expect(next).toHaveBeenCalledOnce();
    expect(legacyMemberIds.has("first-member")).toBe(true);
    expect(req.group).toEqual({ id: 2, role: "owner", isPrivate: true });
    expect(privateWorkspaceIds.has("first-member")).toBe(true);
  });

  it("persists a fresh authenticated user before creating their Personal budget", async () => {
    const req = authenticatedRequest("fresh-user");
    const next = vi.fn();

    await requireMember(req, response(), next);

    expect(next).toHaveBeenCalledOnce();
    expect(persistedUserIds.has("fresh-user")).toBe(true);
    expect(privateWorkspaceIds.has("fresh-user")).toBe(true);
    expect(memberships.get("fresh-user")).toContainEqual({
      groupId: 2,
      role: "owner",
    });
  });

  it("reuses an existing group membership without re-adopting the ledger", async () => {
    groupExists = true;
    memberships.set("owner", [{ groupId: 1, role: "owner" }]);
    const req = authenticatedRequest("owner");

    await requireMember(req, response(), vi.fn());

    expect(req.group).toEqual({ id: 2, role: "owner", isPrivate: true });
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("gives a removed member a private workspace without restoring shared membership", async () => {
    groupExists = true;
    legacyMemberIds.add("removed-member");
    const req = authenticatedRequest("removed-member");
    const next = vi.fn();

    await requireMember(req, response(), next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.group).toEqual({ id: 2, role: "owner", isPrivate: true });
    expect(memberships.get("removed-member")).toEqual([{ groupId: 2, role: "owner" }]);
  });

  it("allows a removed member into their private budget on the next protected request", async () => {
    groupExists = true;
    legacyMemberIds.add("removed-member");

    const res = await request(protectedApp("removed-member")).get("/protected");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ groupId: 2 });
    expect(memberships.get("removed-member")).toEqual([{ groupId: 2, role: "owner" }]);
  });

  it("uses a selected shared workspace only when the signed-in person is still a member", async () => {
    groupExists = true;
    privateWorkspaceIds.set("member", 2);
    memberships.set("member", [
      { groupId: 2, role: "owner" },
      { groupId: 7, role: "member" },
    ]);
    const req = authenticatedRequest("member");
    req.get = (header: string) => header === "x-jamvi-workspace" ? "7" : undefined;

    await requireMember(req, response(), vi.fn());

    expect(req.group).toEqual({ id: 7, role: "member", isPrivate: false });
  });

  it("keeps an explicit web workspace choice for the current browser session", async () => {
    groupExists = true;
    privateWorkspaceIds.set("member", 2);
    memberships.set("member", [
      { groupId: 2, role: "owner" },
      { groupId: 7, role: "member" },
    ]);
    const req = authenticatedRequest("member");
    req.cookies = { [ACTIVE_WORKSPACE_COOKIE]: "7" };

    await requireMember(req, response(), vi.fn());

    expect(req.group).toEqual({ id: 7, role: "member", isPrivate: false });
  });

  it("starts in My Budget instead of honoring the legacy persistent workspace cookie", async () => {
    groupExists = true;
    privateWorkspaceIds.set("member", 2);
    memberships.set("member", [
      { groupId: 2, role: "owner" },
      { groupId: 7, role: "member" },
    ]);
    const req = authenticatedRequest("member");
    req.cookies = { [LEGACY_ACTIVE_WORKSPACE_COOKIE]: "7" };
    const res = response();

    await requireMember(req, res, vi.fn());

    expect(req.group).toEqual({ id: 2, role: "owner", isPrivate: true });
    expect(res.clearCookie).toHaveBeenCalledWith(LEGACY_ACTIVE_WORKSPACE_COOKIE, { path: "/" });
  });

  it("gives the verified mobile workspace header priority over a browser cookie", async () => {
    groupExists = true;
    privateWorkspaceIds.set("member", 2);
    memberships.set("member", [
      { groupId: 2, role: "owner" },
      { groupId: 7, role: "member" },
    ]);
    const req = authenticatedRequest("member");
    req.cookies = { [ACTIVE_WORKSPACE_COOKIE]: "2" };
    req.get = (header: string) => header === "x-jamvi-workspace" ? "7" : undefined;

    await requireMember(req, response(), vi.fn());

    expect(req.group).toEqual({ id: 7, role: "member", isPrivate: false });
  });

  it("falls back to My Budget when a mobile client sends a stale workspace id", async () => {
    groupExists = true;
    privateWorkspaceIds.set("member", 2);
    memberships.set("member", [{ groupId: 2, role: "owner" }]);
    const req = authenticatedRequest("member");
    req.get = (header: string) => header === "x-jamvi-workspace" ? "999" : undefined;

    await requireMember(req, response(), vi.fn());

    expect(req.group).toEqual({ id: 2, role: "owner", isPrivate: true });
  });
});