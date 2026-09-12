/**
 * POST /income-sources did not check subscription status at all - a lapsed
 * member, Personal budget or Shared group alike, could keep adding income
 * sources forever. Found alongside the same gap in contributors.ts and
 * budget-categories.ts while chasing a real report of a lapsed member still
 * being able to "work and save".
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const tables = vi.hoisted(() => ({
  incomeSourcesTable: {
    id: "income.id",
    groupId: "income.groupId",
    userId: "income.userId",
    name: "income.name",
    isMain: "income.isMain",
    expectedMonthlyAmount: "income.expectedMonthlyAmount",
  },
  groupMembershipsTable: { groupId: "membership.groupId", userId: "membership.userId" },
}));

const dbMocks = vi.hoisted(() => ({ insert: vi.fn(), select: vi.fn() }));

const { mockResolve } = vi.hoisted(() => ({
  mockResolve: vi.fn(
    async (): Promise<{ status: string | null; fullAccess: boolean }> =>
      ({ status: "active", fullAccess: true }),
  ),
}));

vi.mock("@workspace/db", () => ({
  db: dbMocks,
  incomeSourcesTable: tables.incomeSourcesTable,
  groupMembershipsTable: tables.groupMembershipsTable,
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...clauses: unknown[]) => ({ and: clauses })),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  ne: vi.fn((column: unknown, value: unknown) => ({ ne: { column, value } })),
  sql: Object.assign(vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })), { raw: vi.fn() }),
}));

vi.mock("../../lib/subscription-catalog", () => ({ resolveMemberEntitlements: mockResolve }));

const { default: incomeSourcesRouter } = await import("../income-sources");

const OWNER_ID = "user-1";

function appFor(isPrivate: boolean) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { group: { id: number; role: string; isPrivate: boolean } }).group =
      { id: 7, role: "owner", isPrivate };
    (req as unknown as { user: { id: string } }).user = { id: OWNER_ID };
    next();
  });
  app.use(incomeSourcesRouter);
  return app;
}

function selectReturning(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.limit = () => Promise.resolve(rows);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolve.mockResolvedValue({ status: "active", fullAccess: true });
  // Membership check, then duplicate-name check: both empty/found as needed.
  dbMocks.select
    .mockImplementationOnce(() => selectReturning([{ userId: OWNER_ID }])) // isGroupMember
    .mockImplementationOnce(() => selectReturning([])); // no duplicate name
  dbMocks.insert.mockReturnValue({
    values: () => ({ returning: () => Promise.resolve([{ id: 1, name: "Salary", userId: OWNER_ID }]) }),
  });
});

describe.each([
  ["a Personal budget", true],
  ["a Shared group", false],
])("POST /income-sources in %s", (_label, isPrivate) => {
  it("refuses a lapsed member with 402, and writes nothing", async () => {
    mockResolve.mockResolvedValue({ status: "expired", fullAccess: false });

    const response = await request(appFor(isPrivate))
      .post("/income-sources")
      .send({ userId: OWNER_ID, name: "Salary" });

    expect(response.status).toBe(402);
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it("lets a current subscriber add an income source", async () => {
    const response = await request(appFor(isPrivate))
      .post("/income-sources")
      .send({ userId: OWNER_ID, name: "Salary" });

    expect(response.status).toBe(201);
    expect(dbMocks.insert).toHaveBeenCalled();
  });
});
