import { beforeEach, describe, expect, it, vi } from "vitest";

// Every table account-deletion.ts imports needs *some* export here — Vitest's
// module mock throws "no X export is defined" for one that's missing, even
// when the function under test never touches it. A Proxy stands in for any
// table so a column reference like `groupsTable.id` never throws either.
const makeTable = (name: string) =>
  new Proxy({}, { get: (_, prop) => ({ _table: name, _col: String(prop) }) });

const dbMocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: dbMocks,
  usersTable: makeTable("users"),
  bankAccountsTable: makeTable("bank_accounts"),
  budgetCategoriesTable: makeTable("budget_categories"),
  contributionsTable: makeTable("contributions"),
  digestSendsTable: makeTable("digest_sends"),
  expensesTable: makeTable("expenses"),
  groupContributorsTable: makeTable("group_contributors"),
  groupMembershipsTable: makeTable("group_memberships"),
  groupPayoutsTable: makeTable("group_payouts"),
  groupsTable: makeTable("groups"),
  incomeSourcesTable: makeTable("income_sources"),
  jointAccountTxTable: makeTable("joint_account_transactions"),
  membersTable: makeTable("members"),
  onboardingPreferencesTable: makeTable("onboarding_preferences"),
  passwordResetTokensTable: makeTable("password_reset_tokens"),
  savingsGoalsTable: makeTable("savings_goals"),
  GROUP_ROLE: { OWNER: "owner", ADMIN: "admin", MEMBER: "member", VIEWER: "viewer" },
}));

vi.mock("../logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

const {
  ACCOUNT_DELETION_GRACE_DAYS,
  accountsDueForErasure,
  cancelPendingAccountDeletion,
  requestAccountDeletion,
  scheduledDeletionDate,
} = await import("../account-deletion");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("scheduledDeletionDate", () => {
  it("is exactly the grace period after the request", () => {
    const requestedAt = new Date("2026-09-11T00:00:00.000Z");
    const scheduled = scheduledDeletionDate(requestedAt);
    const days = (scheduled.getTime() - requestedAt.getTime()) / 86_400_000;
    expect(days).toBe(ACCOUNT_DELETION_GRACE_DAYS);
  });
});

describe("requestAccountDeletion", () => {
  it("stamps the account and reports the day it will actually be erased", async () => {
    const captured: { set?: unknown; where?: unknown } = {};
    dbMocks.update.mockReturnValue({
      set: (values: unknown) => {
        captured.set = values;
        return { where: (clause: unknown) => { captured.where = clause; return Promise.resolve(); } };
      },
    });

    const now = new Date("2026-09-11T00:00:00.000Z");
    const scheduledFor = await requestAccountDeletion("user-1", now);

    expect(captured.set).toMatchObject({ deletionRequestedAt: now });
    expect(scheduledFor.getTime() - now.getTime()).toBe(ACCOUNT_DELETION_GRACE_DAYS * 86_400_000);
  });
});

describe("cancelPendingAccountDeletion", () => {
  it("clears the request, scoped to accounts not already erased", async () => {
    const captured: { set?: unknown; where?: unknown } = {};
    dbMocks.update.mockReturnValue({
      set: (values: unknown) => {
        captured.set = values;
        return { where: (clause: unknown) => { captured.where = clause; return Promise.resolve(); } };
      },
    });

    await cancelPendingAccountDeletion("user-1");

    expect(captured.set).toMatchObject({ deletionRequestedAt: null });
    // Scoped by deletedAt as well as the user id, so a call after erasure has
    // already run is a no-op rather than reviving a scrubbed account.
    expect(JSON.stringify(captured.where)).toContain('"_table":"users","_col":"deletedAt"');
  });
});

describe("accountsDueForErasure", () => {
  it("only returns accounts whose grace period has actually run out", async () => {
    let capturedWhere: unknown;
    dbMocks.select.mockReturnValue({
      from: () => ({
        where: (clause: unknown) => {
          capturedWhere = clause;
          return Promise.resolve([{ id: "user-1" }, { id: "user-2" }]);
        },
      }),
    });

    const ids = await accountsDueForErasure(new Date("2026-09-25T00:00:00.000Z"));

    expect(ids).toEqual(["user-1", "user-2"]);
    expect(JSON.stringify(capturedWhere)).toContain('"_table":"users","_col":"deletionRequestedAt"');
    expect(JSON.stringify(capturedWhere)).toContain('"_table":"users","_col":"deletedAt"');
  });
});
