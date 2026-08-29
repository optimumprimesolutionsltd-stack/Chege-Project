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
        { name: "Food", budgetAmount: 1500 },
        { name: "Transport", budgetAmount: 1000 },
        { name: "Legacy", budgetAmount: 500 },
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
});