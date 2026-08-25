import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("@workspace/db", () => {
  const table = new Proxy({}, { get: () => ({}) });
  return {
    db: {},
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