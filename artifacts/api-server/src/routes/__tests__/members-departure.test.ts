import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => {
  const table = (name: string) => ({
    id: { _table: name, _column: "id" },
    groupId: { _table: name, _column: "group_id" },
    userId: { _table: name, _column: "user_id" },
    role: { _table: name, _column: "role" },
  });

  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn(),
    },
    groupsTable: table("groups"),
    groupInvitationsTable: table("group_invitations"),
    groupMembershipsTable: table("group_memberships"),
    usersTable: table("users"),
    budgetCategoriesTable: table("budget_categories"),
    contributionsTable: table("contributions"),
    digestSendsTable: table("digest_sends"),
    expenseIncomeSplitsTable: table("expense_income_splits"),
    expensesTable: table("expenses"),
    incomeSourcesTable: table("income_sources"),
    jointAccountDepositSplitsTable: table("joint_account_deposit_splits"),
    jointAccountTxTable: table("joint_account_transactions"),
    membersTable: table("members"),
    savingsGoalContributionsTable: table("savings_goal_contributions"),
    savingsGoalsTable: table("savings_goals"),
  };
});

import { db, groupMembershipsTable } from "@workspace/db";
import membersRouter from "../members.js";

type Mock = ReturnType<typeof vi.fn>;

function selectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(rows);
  chain.for = vi.fn().mockResolvedValue(rows);
  chain.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve);
  return chain;
}

function appFor(role: "owner" | "admin" | "member", userId = "current-user") {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: userId };
    req.group = { id: 7, role };
    next();
  });
  app.use("/", membersRouter);
  return app;
}

function configureTransaction(selectResults: unknown[][], deletedRows: unknown[] = [{ userId: "member-1" }]) {
  const deleteWhere = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue(deletedRows),
  });
  const tx = {
    select: vi.fn().mockImplementation(() => selectChain(selectResults.shift() ?? [])),
    delete: vi.fn().mockReturnValue({ where: deleteWhere }),
  };
  (db.transaction as Mock).mockImplementation((callback: (transaction: typeof tx) => unknown) => callback(tx));
  return { tx };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("member departures", () => {
  it("lets a non-owner leave while deleting only their membership", async () => {
    const { tx } = configureTransaction([
      [{ id: 7 }],
      [{ role: "member" }],
    ], [{ groupId: 7, userId: "current-user" }]);

    const response = await request(appFor("member")).delete("/members/me");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(tx.delete).toHaveBeenCalledOnce();
    expect(tx.delete).toHaveBeenCalledWith(groupMembershipsTable);
  });

  it("does not allow the owner to leave the group", async () => {
    const { tx } = configureTransaction([
      [{ id: 7 }],
      [{ role: "owner" }],
    ]);

    const response = await request(appFor("owner")).delete("/members/me");

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/owner cannot leave/i);
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("lets an owner remove a non-owner membership", async () => {
    const { tx } = configureTransaction([
      [{ id: 7 }],
      [{ role: "owner" }],
      [{ role: "member" }],
    ]);

    const response = await request(appFor("owner")).delete("/members/member-1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(tx.delete).toHaveBeenCalledWith(groupMembershipsTable);
  });

  it("blocks a manager whose membership was removed before their queued request runs", async () => {
    const { tx } = configureTransaction([
      [{ id: 7 }],
      [],
    ]);

    const response = await request(appFor("admin")).delete("/members/member-1");

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/owners and admins/i);
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("blocks a regular member from removing someone else", async () => {
    const response = await request(appFor("member")).delete("/members/member-1");

    expect(response.status).toBe(403);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("requires an admin to use the dedicated leave action for themselves", async () => {
    const response = await request(appFor("admin")).delete("/members/current-user");

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/leave group/i);
    expect(db.transaction).not.toHaveBeenCalled();
  });
});