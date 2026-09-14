/**
 * The budget plan a group's onboarding created was write-only until now: no
 * route ever read it back, and nothing let anyone change their mind about its
 * purpose or duration. These cover the two new routes that fix that.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const databaseState = vi.hoisted(() => ({
  existing: [] as Array<{
    id: number;
    groupId: number;
    purpose: string | null;
    durationType: string;
    startDate: string;
    endDate: string | null;
    status: string;
    createdAt: Date;
  }>,
  updateSet: vi.fn((_values: Record<string, unknown>) => undefined),
  updated: null as Record<string, unknown> | null,
}));

vi.mock("@workspace/db", () => {
  const table = new Proxy({}, { get: () => ({}) });
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => Promise.resolve(databaseState.existing),
            }),
          }),
        }),
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => {
          databaseState.updateSet(values);
          return {
            where: () => ({
              returning: () => Promise.resolve([databaseState.updated ?? { ...databaseState.existing[0], ...values }]),
            }),
          };
        },
      }),
    },
    budgetCategoriesTable: table,
    budgetPlanCategoriesTable: table,
    budgetPlansTable: table,
  };
});
vi.mock("drizzle-orm", () => ({ and: vi.fn(), eq: vi.fn(), desc: vi.fn() }));

import budgetPlansRouter from "../budget-plans.js";

function app(role: "owner" | "admin" | "member" | "viewer" = "owner") {
  const server = express();
  server.use(express.json());
  server.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: "user-1" };
    req.group = { id: 1, role };
    next();
  });
  server.use("/", budgetPlansRouter);
  return server;
}

beforeEach(() => {
  vi.clearAllMocks();
  databaseState.existing = [];
  databaseState.updated = null;
});

describe("GET /budget-plans/current", () => {
  it("returns null when the group has no active budget plan", async () => {
    const response = await request(app()).get("/budget-plans/current");
    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
  });

  it("returns the group's active budget plan", async () => {
    databaseState.existing = [{
      id: 5, groupId: 1, purpose: "chama", durationType: "month",
      startDate: "2026-09-01", endDate: null, status: "active", createdAt: new Date(),
    }];
    const response = await request(app()).get("/budget-plans/current");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: 5, purpose: "chama", durationType: "month" });
  });
});

describe("PATCH /budget-plans/current", () => {
  const activePlan = {
    id: 5, groupId: 1, purpose: "chama", durationType: "month",
    startDate: "2026-09-01", endDate: null, status: "active", createdAt: new Date(),
  };

  it("refuses a non-manager", async () => {
    const response = await request(app("member")).patch("/budget-plans/current").send({ purpose: "savings" });
    expect(response.status).toBe(403);
  });

  it("404s when there is nothing to update", async () => {
    const response = await request(app()).patch("/budget-plans/current").send({ purpose: "savings" });
    expect(response.status).toBe(404);
  });

  it("updates purpose alone without touching duration", async () => {
    databaseState.existing = [activePlan];
    const response = await request(app()).patch("/budget-plans/current").send({ purpose: "savings" });
    expect(response.status).toBe(200);
    expect(databaseState.updateSet).toHaveBeenCalledWith(expect.objectContaining({ purpose: "savings" }));
    expect(databaseState.updateSet).toHaveBeenCalledWith(expect.not.objectContaining({ durationType: expect.anything() }));
  });

  it("clears the end date when moving away from a custom duration", async () => {
    databaseState.existing = [{ ...activePlan, durationType: "custom", endDate: "2026-12-01" }];
    const response = await request(app()).patch("/budget-plans/current").send({ durationType: "month" });
    expect(response.status).toBe(200);
    expect(databaseState.updateSet).toHaveBeenCalledWith(expect.objectContaining({ durationType: "month", endDate: null }));
  });

  it("rejects switching to custom without an end date", async () => {
    databaseState.existing = [activePlan];
    const response = await request(app()).patch("/budget-plans/current").send({ durationType: "custom" });
    expect(response.status).toBe(400);
    expect(databaseState.updateSet).not.toHaveBeenCalled();
  });

  it("accepts switching to custom when an end date is given in the same request", async () => {
    databaseState.existing = [activePlan];
    const response = await request(app()).patch("/budget-plans/current").send({ durationType: "custom", endDate: "2026-12-01" });
    expect(response.status).toBe(200);
    expect(databaseState.updateSet).toHaveBeenCalledWith(expect.objectContaining({ durationType: "custom", endDate: "2026-12-01" }));
  });

  it("rejects an end date before the plan's start date", async () => {
    databaseState.existing = [activePlan];
    const response = await request(app()).patch("/budget-plans/current").send({ durationType: "custom", endDate: "2026-01-01" });
    expect(response.status).toBe(400);
    expect(databaseState.updateSet).not.toHaveBeenCalled();
  });
});
