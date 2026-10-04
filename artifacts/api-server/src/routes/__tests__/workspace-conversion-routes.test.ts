import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const conversion = vi.hoisted(() => ({
  makePersonalBudgetShared: vi.fn(),
  makeGroupPersonal: vi.fn(),
  removeEmptyPersonalBudget: vi.fn(),
  personalBudgetStatus: vi.fn(),
}));
const groupStart = vi.hoisted(() => ({ refuseStartingGroup: vi.fn() }));

vi.mock("../../lib/workspace-conversion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/workspace-conversion")>()),
  ...conversion,
}));
vi.mock("../../lib/group-start", () => groupStart);

const { default: router } = await import("../workspaces");
const { WorkspaceConversionError } = await import("../../lib/workspace-conversion");

function app(activeGroupId = 5) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { id: "me" };
    (req as unknown as { group: unknown }).group = { id: activeGroupId, role: "owner", isPrivate: true };
    next();
  });
  server.use(router);
  return server;
}

beforeEach(() => {
  vi.clearAllMocks();
  groupStart.refuseStartingGroup.mockResolvedValue(null);
});

describe("POST /workspaces/personal/make-shared", () => {
  it("needs an active subscription, like starting a group, and changes nothing without one", async () => {
    groupStart.refuseStartingGroup.mockResolvedValue("Starting a new group needs an active Jamvi subscription.");
    const response = await request(app()).post("/workspaces/personal/make-shared").send({ name: "Us", kind: "family" });
    expect(response.status).toBe(402);
    expect(response.body.error).toMatch(/subscription/);
    expect(conversion.makePersonalBudgetShared).not.toHaveBeenCalled();
  });

  it("refuses a duplicate name with the library's sentence", async () => {
    conversion.makePersonalBudgetShared.mockRejectedValue(
      new WorkspaceConversionError(409, "You already have a Shared group with that name. Choose a different name."),
    );
    const response = await request(app()).post("/workspaces/personal/make-shared").send({ name: "Us", kind: "family" });
    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/already have a Shared group with that name/);
  });

  it("refuses to make it 'personal' again", async () => {
    const response = await request(app()).post("/workspaces/personal/make-shared").send({ name: "Us", kind: "personal" });
    expect(response.status).toBe(400);
  });

  it("keeps the converted group active", async () => {
    conversion.makePersonalBudgetShared.mockResolvedValue({ id: 5, name: "Us", kind: "family" });
    const response = await request(app()).post("/workspaces/personal/make-shared").send({ name: "Us", kind: "family" });
    expect(response.status).toBe(200);
    expect(String(response.headers["set-cookie"])).toContain("active_workspace_v2=5");
  });
});

describe("DELETE /workspaces/personal", () => {
  it("clears the active budget when it was the one removed", async () => {
    conversion.removeEmptyPersonalBudget.mockResolvedValue({ removedId: 5 });
    const response = await request(app(5)).delete("/workspaces/personal");
    expect(response.status).toBe(200);
    expect(String(response.headers["set-cookie"])).toMatch(/active_workspace_v2=;/);
  });

  it("leaves another active budget alone", async () => {
    conversion.removeEmptyPersonalBudget.mockResolvedValue({ removedId: 5 });
    const response = await request(app(9)).delete("/workspaces/personal");
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("answers 409 in a plain sentence when it is not empty", async () => {
    conversion.removeEmptyPersonalBudget.mockRejectedValue(new WorkspaceConversionError(409, "Your Personal budget has records in it, so it can't be removed."));
    const response = await request(app()).delete("/workspaces/personal");
    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/has records in it/);
  });
});

describe("POST /workspaces/:id/make-personal", () => {
  it("opens the group as the Personal budget", async () => {
    conversion.makeGroupPersonal.mockResolvedValue({ id: 12, previousPersonal: null });
    const response = await request(app()).post("/workspaces/12/make-personal");
    expect(response.status).toBe(200);
    expect(conversion.makeGroupPersonal).toHaveBeenCalledWith("me", 12);
    expect(String(response.headers["set-cookie"])).toContain("active_workspace_v2=12");
  });

  it("rejects a malformed id", async () => {
    const response = await request(app()).post("/workspaces/abc/make-personal");
    expect(response.status).toBe(400);
  });
});

describe("GET /workspaces/personal/status", () => {
  it("answers exists and empty", async () => {
    conversion.personalBudgetStatus.mockResolvedValue({ exists: true, empty: true, id: 5 });
    const response = await request(app()).get("/workspaces/personal/status");
    expect(response.body).toEqual({ exists: true, empty: true, id: 5 });
  });
});
