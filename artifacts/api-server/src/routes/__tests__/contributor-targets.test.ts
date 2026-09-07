/**
 * Changing what a contributor is expected to give.
 *
 * This existed only at the moment somebody was added, which meant in practice
 * it was never set - and the arrears column, which is measured against it, was
 * empty for every group. So the cases that matter are the guards: a manager
 * only, an id that belongs to this group only, and an explicit null meaning
 * "not expected to give a set amount" rather than "unchanged".
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
  update: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
}));

const activeGroupMocks = vi.hoisted(() => ({
  requireGroupManager: vi.fn(),
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
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...clauses: unknown[]) => ({ and: clauses })),
  asc: vi.fn((column: unknown) => column),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  isNull: vi.fn((column: unknown) => ({ isNull: column })),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn() }),
}));

vi.mock("../../lib/activeGroup", () => ({
  getActiveGroupId: vi.fn((req: { group?: { id: number } }) => req.group?.id ?? null),
  requireGroupManager: activeGroupMocks.requireGroupManager,
}));

vi.mock("../../lib/contribution-grid", () => ({
  buildContributionGrid: vi.fn(() => ({ months: [], rows: [], columnTotals: [], grandTotal: 0 })),
  gridMonths: vi.fn(() => [{ month: 1, year: 2026, label: "Jan 2026" }]),
}));

const { default: contributorsRouter } = await import("../contributors");

function appFor(groupId = 7) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { group: { id: number } }).group = { id: groupId };
    (req as unknown as { user: { id: string } }).user = { id: "user-1" };
    next();
  });
  app.use(contributorsRouter);
  return app;
}

/** The db.update(...).set(...).where(...).returning() chain, with the `where`
 *  captured so the test can prove what it was scoped to. */
function updateReturning(rows: unknown[]) {
  const captured: { where?: unknown; set?: unknown } = {};
  dbMocks.update.mockReturnValue({
    set: (values: unknown) => {
      captured.set = values;
      return {
        where: (clause: unknown) => {
          captured.where = clause;
          return { returning: async () => rows };
        },
      };
    },
  });
  return captured;
}

beforeEach(() => {
  vi.clearAllMocks();
  activeGroupMocks.requireGroupManager.mockReturnValue(true);
});

describe("PATCH /contributors/:id", () => {
  it("sets what one person is expected to give", async () => {
    const captured = updateReturning([
      { id: 3, name: "Grace", userId: null, monthlyTarget: 2_000, archivedAt: null },
    ]);

    const response = await request(appFor()).patch("/contributors/3").send({ monthlyTarget: 2_000 });

    expect(response.status).toBe(200);
    expect(response.body.monthlyTarget).toBe(2_000);
    expect(captured.set).toMatchObject({ monthlyTarget: 2_000 });
  });

  it("treats an explicit null as 'not expected to give a set amount'", async () => {
    // Distinct from omitting the field. A church member who gives what they can
    // must be settable back to no expectation, or the sheet chases them for ever.
    const captured = updateReturning([
      { id: 3, name: "Grace", userId: null, monthlyTarget: null, archivedAt: null },
    ]);

    await request(appFor()).patch("/contributors/3").send({ monthlyTarget: null });

    expect(captured.set).toMatchObject({ monthlyTarget: null });
  });

  it("scopes the change to the active group, so another group's id cannot be guessed", async () => {
    const captured = updateReturning([
      { id: 3, name: "Grace", userId: null, monthlyTarget: 500, archivedAt: null },
    ]);

    await request(appFor(7)).patch("/contributors/3").send({ monthlyTarget: 500 });

    // Both the contributor id and the group are in the where clause.
    expect(JSON.stringify(captured.where)).toContain("contributor.groupId");
    expect(JSON.stringify(captured.where)).toContain("contributor.id");
  });

  it("answers 404 when the contributor belongs to another group", async () => {
    updateReturning([]);

    const response = await request(appFor()).patch("/contributors/999").send({ monthlyTarget: 100 });

    expect(response.status).toBe(404);
  });

  it("refuses a member who is not a manager", async () => {
    activeGroupMocks.requireGroupManager.mockImplementation((_req, res) => {
      res.status(403).json({ error: "Only a manager can do that." });
      return false;
    });

    const response = await request(appFor()).patch("/contributors/3").send({ monthlyTarget: 100 });

    expect(response.status).toBe(403);
    expect(dbMocks.update).not.toHaveBeenCalled();
  });

  it("refuses a negative amount and a nonsense id", async () => {
    updateReturning([]);

    expect((await request(appFor()).patch("/contributors/3").send({ monthlyTarget: -1 })).status).toBe(400);
    expect((await request(appFor()).patch("/contributors/abc").send({ monthlyTarget: 1 })).status).toBe(400);
    expect(dbMocks.update).not.toHaveBeenCalled();
  });

  it("refuses a request that changes nothing rather than reporting success", async () => {
    const response = await request(appFor()).patch("/contributors/3").send({});

    expect(response.status).toBe(400);
    expect(dbMocks.update).not.toHaveBeenCalled();
  });

  it("archives rather than deletes", async () => {
    // Somebody who has left still contributed what they contributed; removing
    // them would make last year's totals disagree with last year's rows.
    const captured = updateReturning([
      { id: 3, name: "Grace", userId: null, monthlyTarget: null, archivedAt: new Date() },
    ]);

    const response = await request(appFor()).patch("/contributors/3").send({ archived: true });

    expect(response.body.archived).toBe(true);
    expect((captured.set as { archivedAt: Date }).archivedAt).toBeInstanceOf(Date);
  });
});
