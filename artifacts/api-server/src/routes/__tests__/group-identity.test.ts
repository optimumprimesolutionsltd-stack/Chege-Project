import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const tables = vi.hoisted(() => ({
  groupsTable: {
    id: "group.id",
    name: "group.name",
    icon: "group.icon",
    accentColor: "group.accentColor",
    privateOwnerUserId: "group.privateOwnerUserId",
  },
  groupMembershipsTable: {
    groupId: "membership.groupId",
    userId: "membership.userId",
  },
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
  groupsTable: tables.groupsTable,
  groupMembershipsTable: tables.groupMembershipsTable,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
}));

vi.mock("../../lib/activeGroup", () => ({
  canRecordSharedTransactions: vi.fn().mockResolvedValue(true),
  getActiveGroupId: vi.fn((req: { group?: { id: number } }) => req.group?.id ?? null),
  requireGroupManager: vi.fn(() => true),
  setActiveWorkspaceCookie: vi.fn(),
}));

import { db } from "@workspace/db";
import groupRouter from "../group.js";

const mockedDb = db as unknown as {
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: "owner-1" };
    req.group = { id: 4, role: "owner" };
    next();
  });
  app.use("/", groupRouter);
  return app;
}

describe("PATCH /group identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDb.select.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    });
  });

  it("persists the allowed icon and accent selected by a manager", async () => {
    const updated = {
      id: 4,
      name: "Mwangi family",
      icon: "heart",
      accentColor: "#DB2777",
      isPrivate: null,
    };
    const set = vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([updated]),
      })),
    }));
    mockedDb.update.mockReturnValue({ set });

    const response = await request(buildApp()).patch("/group").send({
      name: "Mwangi family",
      icon: "heart",
      accentColor: "#DB2777",
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 4,
      name: "Mwangi family",
      icon: "heart",
      accentColor: "#DB2777",
      isPrivate: false,
      role: "owner",
    });
    expect(set).toHaveBeenCalledWith({
      name: "Mwangi family",
      icon: "heart",
      accentColor: "#DB2777",
    });
  });

  it("rejects a custom icon that is outside the curated set", async () => {
    const response = await request(buildApp()).patch("/group").send({
      name: "Mwangi family",
      icon: "unrestricted-custom-icon",
      accentColor: "#DB2777",
    });

    expect(response.status).toBe(400);
    expect(mockedDb.update).not.toHaveBeenCalled();
  });

  it.each(["  ", " a "])("rejects a name that is too short after trimming: %j", async (name) => {
    const response = await request(buildApp()).patch("/group").send({
      name,
      icon: "heart",
      accentColor: "#DB2777",
    });

    expect(response.status).toBe(400);
    expect(mockedDb.update).not.toHaveBeenCalled();
  });
});