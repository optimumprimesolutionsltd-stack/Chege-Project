import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));

vi.mock("@workspace/db", () => {
  const table = new Proxy({}, { get: (_, property) => property });
  return {
    db: {
      select: mockSelect,
      insert: vi.fn(),
      transaction: vi.fn(),
    },
    onboardingPreferencesTable: table,
    budgetCategoriesTable: table,
    groupMembershipsTable: table,
    groupsTable: table,
  };
});

vi.mock("drizzle-orm", () => ({ eq: vi.fn((column, value) => ({ column, value })), and: vi.fn() }));
vi.mock("../../lib/activeGroup", () => ({ setActiveWorkspaceCookie: vi.fn() }));

import onboardingRouter from "../onboarding.js";

function buildApp() {
  const app = express();
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: "test-user" };
    next();
  });
  app.use(express.json());
  app.use("/api", onboardingRouter);
  return app;
}

describe("onboarding preferences availability", () => {
  beforeEach(() => vi.clearAllMocks());

  it("treats a missing onboarding relation as an unstarted read", async () => {
    mockSelect.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: vi.fn().mockRejectedValue({
            code: "42P01",
            message: 'relation "onboarding_preferences" does not exist',
          }),
        }),
      }),
    });

    const response = await request(buildApp()).get("/api/onboarding/preferences");

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
  });

  it("returns a structured temporary-unavailable response for other read failures", async () => {
    mockSelect.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: vi.fn().mockRejectedValue(new Error("connection reset")),
        }),
      }),
    });

    const response = await request(buildApp()).get("/api/onboarding/preferences");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Onboarding preferences are temporarily unavailable." });
  });
});
