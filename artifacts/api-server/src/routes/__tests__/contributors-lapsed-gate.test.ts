/**
 * POST /contributors did not check subscription status at all - a lapsed
 * manager, Personal budget or Shared group alike, could keep adding names to
 * the ledger forever. Found alongside the same gap in income-sources.ts and
 * budget-categories.ts while chasing a real report of a lapsed member still
 * being able to "work and save".
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const tables = vi.hoisted(() => ({
  groupContributorsTable: {
    id: "contributor.id",
    groupId: "contributor.groupId",
    name: "contributor.name",
    userId: "contributor.userId",
    monthlyTarget: "contributor.monthlyTarget",
    archivedAt: "contributor.archivedAt",
  },
  groupsTable: { id: "group.id", defaultMonthlyTarget: "group.defaultMonthlyTarget" },
}));

const dbMocks = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
}));

const { mockResolve } = vi.hoisted(() => ({
  mockResolve: vi.fn(
    async (): Promise<{ status: string | null; fullAccess: boolean }> =>
      ({ status: "active", fullAccess: true }),
  ),
}));

vi.mock("@workspace/db", () => ({
  db: dbMocks,
  groupContributorsTable: tables.groupContributorsTable,
  groupsTable: tables.groupsTable,
  contributionsTable: {},
  groupMembershipsTable: {},
  jointAccountDepositSplitsTable: {},
  jointAccountTxTable: {},
  usersTable: {},
  bankAccountsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...clauses: unknown[]) => ({ and: clauses })),
  asc: vi.fn((column: unknown) => column),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  isNull: vi.fn((column: unknown) => ({ isNull: column })),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn() }),
}));

vi.mock("../../lib/contribution-grid", () => ({
  buildContributionGrid: vi.fn(() => ({ months: [], rows: [], columnTotals: [], grandTotal: 0 })),
  gridMonths: vi.fn(() => [{ month: 1, year: 2026, label: "Jan 2026" }]),
}));

// The real activeGroup module runs here (unlike contributor-targets.test.ts),
// so requireTransactionEligibility actually executes - only its own
// dependency, entitlements resolution, is mocked.
vi.mock("../../lib/subscription-catalog", () => ({ resolveMemberEntitlements: mockResolve }));

const { default: contributorsRouter } = await import("../contributors");

function appFor(isPrivate: boolean) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { group: { id: number; role: string; isPrivate: boolean } }).group =
      { id: 7, role: "owner", isPrivate };
    (req as unknown as { user: { id: string } }).user = { id: "user-1" };
    next();
  });
  app.use(contributorsRouter);
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
  dbMocks.select.mockReturnValue(selectReturning([]));
  dbMocks.insert.mockReturnValue({
    values: () => ({ returning: () => Promise.resolve([{ id: 1, name: "Grace", monthlyTarget: null }]) }),
  });
});

describe.each([
  ["a Personal budget", true],
  ["a Shared group", false],
])("POST /contributors in %s", (_label, isPrivate) => {
  it("refuses a lapsed owner with 402, and writes nothing", async () => {
    mockResolve.mockResolvedValue({ status: "expired", fullAccess: false });

    const response = await request(appFor(isPrivate)).post("/contributors").send({ name: "Grace Njoroge" });

    expect(response.status).toBe(402);
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it("lets a current subscriber add a contributor", async () => {
    const response = await request(appFor(isPrivate)).post("/contributors").send({ name: "Grace Njoroge" });

    expect(response.status).toBe(201);
    expect(dbMocks.insert).toHaveBeenCalled();
  });
});
