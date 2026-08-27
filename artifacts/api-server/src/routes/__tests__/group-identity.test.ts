import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const tables = vi.hoisted(() => ({
  groupsTable: {
    id: "group.id",
    name: "group.name",
    emoji: "group.emoji",
    nameStyle: "group.nameStyle",
    icon: "group.icon",
    accentColor: "group.accentColor",
    photoPath: "group.photoPath",
    slogan: "group.slogan",
    privateOwnerUserId: "group.privateOwnerUserId",
  },
  groupMembershipsTable: {
    groupId: "membership.groupId",
    userId: "membership.userId",
  },
}));
const activeGroupMocks = vi.hoisted(() => ({
  requireGroupManager: vi.fn(),
}));
const photoStorageMocks = vi.hoisted(() => ({
  resolvePhotoUrl: vi.fn(async (photoPath: string | null) => photoPath ? `signed:${photoPath}` : null),
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
  requireGroupManager: activeGroupMocks.requireGroupManager,
  setActiveWorkspaceCookie: vi.fn(),
}));
vi.mock("../../lib/photoStorage", () => photoStorageMocks);

import { db } from "@workspace/db";
import groupRouter from "../group.js";

const mockedDb = db as unknown as {
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function buildApp({
  groupId = 4,
  role = "owner",
  isPrivate = false,
}: {
  groupId?: number;
  role?: "owner" | "admin" | "member";
  isPrivate?: boolean;
} = {}) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: "owner-1" };
    req.group = { id: groupId, role, isPrivate };
    next();
  });
  app.use("/", groupRouter);
  return app;
}

describe("PATCH /group identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeGroupMocks.requireGroupManager.mockImplementation((req: any, res: any) => {
      if (req.group?.role === "owner" || req.group?.role === "admin") return true;
      res.status(403).json({ error: "Only owners and admins can manage this Shared budget." });
      return false;
    });
    mockedDb.select.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    });
  });

  it("persists a Unicode name and the curated identity selected by a manager", async () => {
    const updated = {
      id: 4,
      name: "Mwangaza 2026 + Chama №1",
      emoji: "🪴",
      nameStyle: "serif",
      icon: "heart",
      accentColor: "#DB2777",
      photoPath: null,
      slogan: null,
      isPrivate: null,
    };
    const set = vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([updated]),
      })),
    }));
    mockedDb.update.mockReturnValue({ set });

    const response = await request(buildApp()).patch("/group").send({
      name: "Mwangaza 2026 + Chama №1",
      emoji: "🪴",
      nameStyle: "serif",
      icon: "heart",
      accentColor: "#DB2777",
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 4,
      name: "Mwangaza 2026 + Chama №1",
      emoji: "🪴",
      nameStyle: "serif",
      icon: "heart",
      accentColor: "#DB2777",
      isPrivate: false,
      role: "owner",
    });
    expect(set).toHaveBeenCalledWith({
      name: "Mwangaza 2026 + Chama №1",
      emoji: "🪴",
      nameStyle: "serif",
      icon: "heart",
      accentColor: "#DB2777",
    });
  });

  it("updates only the active Personal budget identity", async () => {
    const updated = {
      id: 4,
      name: "My Future Fund",
      emoji: "🌱",
      nameStyle: "bold",
      icon: "star",
      accentColor: "#059669",
      photoPath: null,
      slogan: null,
      isPrivate: "owner-1",
    };
    const returning = vi.fn().mockResolvedValue([updated]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    mockedDb.update.mockReturnValue({ set });

    const response = await request(buildApp({ groupId: 4, isPrivate: true })).patch("/group").send({
      name: "My Future Fund",
      emoji: "🌱",
      nameStyle: "bold",
      icon: "star",
      accentColor: "#059669",
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 4,
      isPrivate: true,
      nameStyle: "bold",
      icon: "star",
      accentColor: "#059669",
    });
    expect(where).toHaveBeenCalledWith({
      column: tables.groupsTable.id,
      value: 4,
    });
    expect(where).not.toHaveBeenCalledWith({
      column: tables.groupsTable.id,
      value: 9,
    });
  });

  it("rejects a photo for a Personal budget before writing anything", async () => {
    const response = await request(buildApp({ isPrivate: true })).patch("/group").send({
      name: "My Future Fund",
      photoPath: "/objects/photos/4f23a8d2-67a9-4d55-8c4a-2ed970d1b506",
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Photos are only available for Shared budgets." });
    expect(mockedDb.update).not.toHaveBeenCalled();
  });

  it("does not expose a legacy Personal budget photo", async () => {
    mockedDb.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{
            id: 4,
            name: "My Future Fund",
            emoji: "🌱",
            nameStyle: "bold",
            icon: "star",
            accentColor: "#059669",
            photoPath: "private/workspaces/4/legacy.webp",
            slogan: null,
            kind: "personal",
            isPrivate: "owner-1",
          }]),
        }),
      }),
    });

    const response = await request(buildApp({ isPrivate: true })).get("/group");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: 4, isPrivate: true, photoUrl: null });
    expect(photoStorageMocks.resolvePhotoUrl).not.toHaveBeenCalled();
  });

  it("does not let a Shared budget member change its identity", async () => {
    const response = await request(buildApp({ role: "member" })).patch("/group").send({
      name: "Member override",
      emoji: "⚠️",
      nameStyle: "bold",
      icon: "star",
      accentColor: "#DB2777",
    });

    expect(response.status).toBe(403);
    expect(mockedDb.update).not.toHaveBeenCalled();
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