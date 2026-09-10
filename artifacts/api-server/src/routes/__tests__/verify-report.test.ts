/**
 * The public /r/:code verification page.
 *
 * The figures it shows come from loadContributionGrid, which is exercised by
 * the grid endpoint's own tests; what matters here is the routing contract —
 * a genuine code renders the group's sheet, a bad one 404s an HTML page, and
 * anything that is not a verification code is left for the SPA below.
 */

import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const dbMocks = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock("@workspace/db", () => ({
  db: dbMocks,
  groupsTable: { id: "group.id", name: "group.name" },
  groupContributorsTable: {},
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

const { default: verifyReportRouter } = await import("../verifyReport");
const { groupVerifyCode } = await import("../../lib/contribution-verification");

function app() {
  const instance = express();
  instance.use(verifyReportRouter);
  instance.get("/{*rest}", (_req, res) => res.status(200).send("SPA FELL THROUGH"));
  return instance;
}

describe("GET /r/:code", () => {
  it("returns an HTML not-found page for a code that is not genuine", async () => {
    const response = await request(app()).get("/r/zz-0000000000").set("Accept", "text/html");
    expect(response.status).toBe(404);
    expect(response.type).toBe("text/html");
    expect(response.text).toContain("could not be checked");
    expect(response.headers["cache-control"]).toContain("no-store");
  });

  it("leaves a non-HTML request for a bad code to the SPA below", async () => {
    const response = await request(app()).get("/r/zz-0000000000").set("Accept", "application/json");
    expect(response.text).toBe("SPA FELL THROUGH");
  });

  it("404s a genuine code whose group no longer exists", async () => {
    dbMocks.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });
    const response = await request(app())
      .get(`/r/${groupVerifyCode(4242)}`)
      .set("Accept", "text/html");
    expect(response.status).toBe(404);
    expect(response.text).toContain("no longer in Jamvi");
  });
});
