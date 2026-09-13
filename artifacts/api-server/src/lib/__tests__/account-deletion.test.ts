import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

// Every table account-deletion.ts imports needs *some* export here — Vitest's
// module mock throws "no X export is defined" for one that's missing, even
// when the function under test never touches it. A Proxy stands in for any
// table so a column reference like `groupsTable.id` never throws either.
const makeTable = (name: string) =>
  new Proxy({}, { get: (_, prop) => ({ _table: name, _col: String(prop) }) });

const dbMocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  transaction: vi.fn(),
}));

const { sendEmail } = vi.hoisted(() => ({
  // Typed parameters, not inferred ones: a vi.fn() with no declared arguments
  // infers an empty tuple, and every mock.calls[0][0] below then fails to
  // compile even though the test itself is right.
  sendEmail: vi.fn(async (_email: { from: string; to: string[]; subject: string; html: string }) => ({ id: "email-1" })),
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
  subscriptionRemindersTable: makeTable("subscription_reminders"),
  accountDeletionCodesTable: makeTable("account_deletion_codes"),
  GROUP_ROLE: { OWNER: "owner", ADMIN: "admin", MEMBER: "member", VIEWER: "viewer" },
}));

vi.mock("../logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("../email", () => ({
  sendEmail,
  EmailNotConfiguredError: class EmailNotConfiguredError extends Error {},
}));

const {
  ACCOUNT_DELETION_GRACE_DAYS,
  accountsDueForErasure,
  cancelPendingAccountDeletion,
  confirmAccountDeletionCode,
  IncorrectDeletionCodeError,
  requestAccountDeletion,
  requestAccountDeletionCode,
  scheduledDeletionDate,
  sendAccountDeletionReminders,
} = await import("../account-deletion");

/** The db.select(...).from(...).where(...).limit(1) chain, resolving to `rows`. */
function selectReturning(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(rows),
      }),
    }),
  };
}

/** The extra .orderBy() step confirmAccountDeletionCode's own lookup takes. */
function selectPendingCode(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: () => Promise.resolve(rows),
        }),
      }),
    }),
  };
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

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
  function stubUpdate() {
    const captured: { set?: unknown; where?: unknown } = {};
    dbMocks.update.mockReturnValue({
      set: (values: unknown) => {
        captured.set = values;
        return { where: (clause: unknown) => { captured.where = clause; return Promise.resolve(); } };
      },
    });
    return captured;
  }

  it("stamps the account and reports the day it will actually be erased", async () => {
    dbMocks.select.mockReturnValue(selectReturning([
      { email: "ann@example.com", firstName: "Ann", deletionRequestedAt: null },
    ]));
    const captured = stubUpdate();

    const now = new Date("2026-09-11T00:00:00.000Z");
    const scheduledFor = await requestAccountDeletion("user-1", now);

    expect(captured.set).toMatchObject({ deletionRequestedAt: now });
    expect(scheduledFor.getTime() - now.getTime()).toBe(ACCOUNT_DELETION_GRACE_DAYS * 86_400_000);
  });

  it("emails the confirmation on a first request", async () => {
    dbMocks.select.mockReturnValue(selectReturning([
      { email: "ann@example.com", firstName: "Ann", deletionRequestedAt: null },
    ]));
    stubUpdate();

    await requestAccountDeletion("user-1", new Date("2026-09-11T00:00:00.000Z"));

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toEqual(["ann@example.com"]);
    expect(sendEmail.mock.calls[0][0].subject).toMatch(/scheduled for deletion/i);
  });

  it("does not re-send the confirmation when a retry restarts the clock", async () => {
    // A client retry hits this again for an already-pending request - the
    // clock restarting must not also restart the inbox.
    dbMocks.select.mockReturnValue(selectReturning([
      { email: "ann@example.com", firstName: "Ann", deletionRequestedAt: new Date("2026-09-01T00:00:00.000Z") },
    ]));
    stubUpdate();

    await requestAccountDeletion("user-1", new Date("2026-09-11T00:00:00.000Z"));

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("still schedules the deletion even if the account has no email on file", async () => {
    dbMocks.select.mockReturnValue(selectReturning([]));
    const captured = stubUpdate();

    const now = new Date("2026-09-11T00:00:00.000Z");
    await requestAccountDeletion("user-1", now);

    expect(captured.set).toMatchObject({ deletionRequestedAt: now });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("requestAccountDeletionCode", () => {
  it("emails a code and stores exactly that code's hash", async () => {
    dbMocks.select.mockReturnValue(selectReturning([{ email: "ann@example.com", firstName: "Ann" }]));
    const insertValues = vi.fn((values: unknown) => values);
    dbMocks.insert.mockReturnValue({ values: insertValues });

    await requestAccountDeletionCode("user-1", new Date("2026-09-11T00:00:00.000Z"));

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const html = sendEmail.mock.calls[0][0].html;
    const code = /(\d{6})/.exec(html)?.[1];
    expect(code).toMatch(/^\d{6}$/);

    const stored = insertValues.mock.calls[0][0] as { codeHash: string; expiresAt: Date };
    expect(stored.codeHash).toBe(sha256(code as string));
    expect(stored.expiresAt.getTime() - new Date("2026-09-11T00:00:00.000Z").getTime()).toBe(10 * 60 * 1000);
  });

  it("refuses an account with no email on file, without sending anything", async () => {
    dbMocks.select.mockReturnValue(selectReturning([{ email: null, firstName: "Ann" }]));

    await expect(requestAccountDeletionCode("user-1")).rejects.toThrow(/no email on file/i);
    expect(dbMocks.insert).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("surfaces a failure to send as an error the caller must act on", async () => {
    // Unlike the other account-deletion emails, this one is not best-effort:
    // it is the entire mechanism, so a silent failure would leave the member
    // with no way to ever confirm.
    dbMocks.select.mockReturnValue(selectReturning([{ email: "ann@example.com", firstName: "Ann" }]));
    dbMocks.insert.mockReturnValue({ values: vi.fn() });
    sendEmail.mockRejectedValueOnce(new Error("Resend is down"));

    await expect(requestAccountDeletionCode("user-1")).rejects.toThrow(/could not send/i);
  });
});

describe("confirmAccountDeletionCode", () => {
  const NOW = new Date("2026-09-11T00:00:00.000Z");

  /** Two different tables get updated here — the code row, then (inside the
   *  delegated requestAccountDeletion call) the user row — so every set()
   *  call is collected in order rather than keeping only the last. */
  function stubUpdateAll() {
    const calls: unknown[] = [];
    dbMocks.update.mockReturnValue({
      set: (values: unknown) => {
        calls.push(values);
        return { where: () => Promise.resolve() };
      },
    });
    return calls;
  }

  it("starts the grace period and marks the code used when it matches", async () => {
    dbMocks.select
      .mockReturnValueOnce(selectPendingCode([{ id: "code-1", codeHash: sha256("482913") }]))
      .mockReturnValueOnce(selectReturning([{ email: "ann@example.com", firstName: "Ann", deletionRequestedAt: null }]));
    const updates = stubUpdateAll();

    const scheduledFor = await confirmAccountDeletionCode("user-1", "482913", NOW);

    expect(scheduledFor.getTime() - NOW.getTime()).toBe(ACCOUNT_DELETION_GRACE_DAYS * 86_400_000);
    expect(updates[0]).toMatchObject({ usedAt: NOW });
    expect(updates[1]).toMatchObject({ deletionRequestedAt: NOW });
  });

  it("refuses a code that does not match, and starts nothing", async () => {
    dbMocks.select.mockReturnValueOnce(selectPendingCode([{ id: "code-1", codeHash: sha256("482913") }]));

    await expect(confirmAccountDeletionCode("user-1", "000000", NOW)).rejects.toThrow(IncorrectDeletionCodeError);
    expect(dbMocks.update).not.toHaveBeenCalled();
  });

  it("refuses when nothing is pending — already used, expired, or never requested", async () => {
    dbMocks.select.mockReturnValueOnce(selectPendingCode([]));

    await expect(confirmAccountDeletionCode("user-1", "482913", NOW)).rejects.toThrow(IncorrectDeletionCodeError);
    expect(dbMocks.update).not.toHaveBeenCalled();
  });
});

describe("sendAccountDeletionReminders", () => {
  const NOW = new Date("2026-09-11T00:00:00.000Z");

  it("reminds an account two days out, and claims the reminder so it is not sent twice", async () => {
    const requestedAt = new Date(NOW.getTime() - 12 * 86_400_000); // 2 days left of a 14-day window
    dbMocks.select.mockReturnValue({
      from: () => ({ where: () => Promise.resolve([
        { id: "user-1", email: "ann@example.com", firstName: "Ann", deletionRequestedAt: requestedAt },
      ]) }),
    });
    dbMocks.insert.mockReturnValue({
      values: () => ({ onConflictDoNothing: () => ({ returning: () => Promise.resolve([{ id: 1 }]) }) }),
    });

    const result = await sendAccountDeletionReminders(NOW);

    expect(result).toEqual({ examined: 1, sent: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].subject).toMatch(/will be deleted/i);
  });

  it("says nothing to an account with plenty of time left", async () => {
    const requestedAt = new Date(NOW.getTime() - 1 * 86_400_000); // 13 days left
    dbMocks.select.mockReturnValue({
      from: () => ({ where: () => Promise.resolve([
        { id: "user-1", email: "ann@example.com", firstName: "Ann", deletionRequestedAt: requestedAt },
      ]) }),
    });

    const result = await sendAccountDeletionReminders(NOW);

    expect(result).toEqual({ examined: 1, sent: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("leaves an account already due for erasure to runAccountDeletions, not a reminder", async () => {
    const requestedAt = new Date(NOW.getTime() - 20 * 86_400_000); // past the 14-day window already
    dbMocks.select.mockReturnValue({
      from: () => ({ where: () => Promise.resolve([
        { id: "user-1", email: "ann@example.com", firstName: "Ann", deletionRequestedAt: requestedAt },
      ]) }),
    });

    const result = await sendAccountDeletionReminders(NOW);

    expect(result).toEqual({ examined: 1, sent: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("does not send a second reminder once one has already been claimed", async () => {
    const requestedAt = new Date(NOW.getTime() - 12 * 86_400_000);
    dbMocks.select.mockReturnValue({
      from: () => ({ where: () => Promise.resolve([
        { id: "user-1", email: "ann@example.com", firstName: "Ann", deletionRequestedAt: requestedAt },
      ]) }),
    });
    // onConflictDoNothing's insert returns nothing when another run already
    // claimed this (user, kind, sentFor) combination.
    dbMocks.insert.mockReturnValue({
      values: () => ({ onConflictDoNothing: () => ({ returning: () => Promise.resolve([]) }) }),
    });

    const result = await sendAccountDeletionReminders(NOW);

    expect(result).toEqual({ examined: 1, sent: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
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
