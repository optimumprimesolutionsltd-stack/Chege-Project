import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock, sendEmailMock } = vi.hoisted(() => ({
  sqlMock: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
  sendEmailMock: vi.fn(),
}));

vi.mock("@workspace/db", () => {
  const table = new Proxy({}, { get: () => ({}) });
  return {
    db: {
      delete: vi.fn(),
      execute: vi.fn(),
      insert: vi.fn(),
      select: vi.fn(),
      update: vi.fn(),
    },
    expensesTable: table,
    expenseCategoryAllocationsTable: table,
    budgetCategoriesTable: table,
    contributionsTable: table,
    usersTable: table,
    groupMembershipsTable: table,
    groupsTable: table,
    digestSendsTable: table,
  };
});

vi.mock("drizzle-orm", () => ({
  sql: sqlMock,
  eq: vi.fn(),
  desc: vi.fn(),
  and: vi.fn(),
}));

vi.mock("../email.js", () => ({ sendEmail: sendEmailMock }));

import { db } from "@workspace/db";
import { sendMonthlyDigest } from "../digest.js";

const mockedDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;

function selectResult(result: unknown) {
  const chain = {
    from: () => chain,
    groupBy: () => chain,
    leftJoin: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    where: () => chain,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

describe("sendMonthlyDigest category allocations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEmailMock.mockResolvedValue({ id: "email-1" });
    mockedDb.insert.mockReturnValue({
      values: () => ({ onConflictDoNothing: () => ({ returning: () => Promise.resolve([{ id: 9 }]) }) }),
    });
    mockedDb.update.mockReturnValue({ set: () => ({ where: () => Promise.resolve() }) });
  });

  it("uses allocation portions and falls back to a legacy expense category", async () => {
    mockedDb.select
      .mockReturnValueOnce(selectResult([{ total: 1200 }]))
      .mockReturnValueOnce(selectResult([{ total: 3000 }]))
      .mockReturnValueOnce(selectResult([
        { id: 1, parentId: null, name: "Food", budgetAmount: 1500 },
        { id: 2, parentId: null, name: "Transport", budgetAmount: 1000 },
        { id: 3, parentId: null, name: "Legacy", budgetAmount: 500 },
      ]))
      .mockReturnValueOnce(selectResult([]))
      .mockReturnValueOnce(selectResult([]))
      .mockReturnValueOnce(selectResult([{ userId: "user-1", monthlyTarget: null, firstName: "Amina", email: "amina@example.com" }]));
    mockedDb.execute.mockResolvedValue({
      rows: [
        { category: "Food", total: "600" },
        { category: "Transport", total: "400" },
        { category: "Legacy", total: "200" },
      ],
    });

    await sendMonthlyDigest(8, 2026, { groupId: 1 });

    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      html: expect.stringContaining("Food"),
    }));
    const html = sendEmailMock.mock.calls[0][0].html;
    expect(html).toContain("KES 600");
    expect(html).toContain("Transport");
    expect(html).toContain("KES 400");
    expect(html).toContain("Legacy");
    expect(html).toContain("KES 200");

    const categoryQuery = mockedDb.execute.mock.calls[0][0];
    expect(categoryQuery.strings.join("")).toContain("expense_category_allocations");
    expect(categoryQuery.strings.join("")).toContain("NOT EXISTS");
  });

  it("shows a parent's rolled-up total, not its own zeroed column", async () => {
    // The server zeroes a parent's own budgetAmount the instant it gains a
    // child (clearParentBudgetAmount, budget-categories.ts) - its real figure
    // is the sum of its children's, which the digest has to compute itself
    // from the flat list it gets back.
    mockedDb.select
      .mockReturnValueOnce(selectResult([{ total: 0 }]))
      // Deliberately different from the categories' own total below: this is
      // a separate mocked round trip, not derived from it, so a test that
      // only checked this figure could pass without the fix under test.
      .mockReturnValueOnce(selectResult([{ total: 12345 }]))
      .mockReturnValueOnce(selectResult([
        { id: 10, parentId: null, name: "Food", budgetAmount: 0 },
        { id: 11, parentId: 10, name: "Groceries", budgetAmount: 5000 },
        { id: 12, parentId: 10, name: "Eating out", budgetAmount: 3000 },
      ]))
      .mockReturnValueOnce(selectResult([]))
      .mockReturnValueOnce(selectResult([]))
      .mockReturnValueOnce(selectResult([{ userId: "user-1", monthlyTarget: null, firstName: "Amina", email: "amina@example.com" }]));
    mockedDb.execute.mockResolvedValue({ rows: [] });

    await sendMonthlyDigest(8, 2026, { groupId: 1 });

    const html = sendEmailMock.mock.calls[0][0].html;
    // Food's own stored column is 0; its rolled-up figure (5000 + 3000) is
    // what should actually appear in its row, distinct from the header's
    // unrelated 12,345 total.
    expect(html).toContain("KES 12,345");
    expect(html).toContain("KES 8,000");
  });
});