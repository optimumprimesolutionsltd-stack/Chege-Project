import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const databaseState = vi.hoisted(() => ({
  existing: [{
    id: 1,
    userId: "member-1",
    createdAt: new Date(),
  }],
  updated: {
    id: 1,
    groupId: 1,
    userId: "member-1",
    amount: 2500,
    month: 8,
    year: 2026,
    note: "Updated",
    createdAt: new Date(),
  },
  updateCalls: 0,
}));

vi.mock("@workspace/db", () => {
  const table = new Proxy({}, { get: () => ({}) });
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => databaseState.existing),
          })),
        })),
      })),
      update: vi.fn(() => {
        databaseState.updateCalls += 1;
        return {
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn(async () => [databaseState.updated]),
            })),
          })),
        };
      }),
      query: {
        usersTable: {
          findFirst: vi.fn(async () => ({ firstName: "Mina", email: "mina@example.com" })),
        },
      },
    },
    contributionsTable: table,
    usersTable: table,
    groupMembershipsTable: table,
  };
});
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));

import contributionsRouter from "../contributions.js";

function app(role: "owner" | "admin" | "member") {
  const server = express();
  server.use(express.json());
  server.use((_req: any, _res, next) => {
    _req.isAuthenticated = () => true;
    _req.user = { id: "member-1" };
    _req.group = { id: 1, role };
    next();
  });
  server.use("/", contributionsRouter);
  return server;
}

describe("contribution removal permissions", () => {
  it("does not allow a member to remove their own contribution", async () => {
    const response = await request(app("member")).delete("/contributions/1");

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Forbidden");
  });
});

describe("contribution edit permissions", () => {
  it("allows a manager to update a workspace-scoped contribution", async () => {
    databaseState.existing = [{
      id: 1,
      userId: "member-1",
      createdAt: new Date(),
    }];

    const response = await request(app("owner"))
      .patch("/contributions/1")
      .send({ amount: 2500, month: 8, year: 2026, note: "Updated" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 1,
      userId: "member-1",
      userName: "Mina",
      amount: 2500,
      note: "Updated",
    });
  });

  it("does not allow a member to edit another member's contribution", async () => {
    databaseState.existing = [{
      id: 1,
      userId: "member-2",
      createdAt: new Date(),
    }];

    const response = await request(app("member"))
      .patch("/contributions/1")
      .send({ amount: 2500, month: 8, year: 2026 });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("their own contributions");
  });

  it("does not allow a member to edit their own older contribution", async () => {
    databaseState.existing = [{
      id: 1,
      userId: "member-1",
      createdAt: new Date("2025-01-01T09:00:00+03:00"),
    }];

    const response = await request(app("member"))
      .patch("/contributions/1")
      .send({ amount: 2500, month: 1, year: 2025 });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("recorded today");
  });

  it.each([
    { amount: -1, month: 8, year: 2026 },
    { amount: 0, month: 8, year: 2026 },
    { amount: 1.5, month: 8, year: 2026 },
    { amount: 100, month: 0, year: 2026 },
    { amount: 100, month: 13, year: 2026 },
    { amount: 100, month: 8.5, year: 2026 },
    { amount: 100, month: 8, year: 1999 },
    { amount: 100, month: 8, year: 2201 },
    { amount: 100, month: 8, year: 2026.5 },
  ])("rejects invalid contribution values without writing: %j", async (payload) => {
    databaseState.updateCalls = 0;
    const response = await request(app("owner"))
      .patch("/contributions/1")
      .send(payload);

    expect(response.status).toBe(400);
    expect(databaseState.updateCalls).toBe(0);
  });
});