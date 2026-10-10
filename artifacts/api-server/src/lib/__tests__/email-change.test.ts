import { beforeEach, describe, expect, it, vi } from "vitest";

const selectResults: unknown[][] = [];
const inserted: Array<{ table: string; values: Record<string, unknown> }> = [];
const updated: Array<{ table: string; set: Record<string, unknown> }> = [];
let selectThrows = false;

vi.mock("@workspace/db", () => {
  const table = (name: string) => new Proxy({ _name: name }, { get: (t, k) => (k === "_name" ? name : { _table: name, _column: String(k) }) });
  const chain = () => {
    const c: Record<string, unknown> = {};
    for (const m of ["from", "where", "orderBy"]) c[m] = () => c;
    c.limit = async () => {
      if (selectThrows) throw new Error("relation does not exist");
      return selectResults.shift() ?? [];
    };
    return c;
  };
  const writer = {
    insert: (t: { _name: string }) => ({
      values: (values: Record<string, unknown>) => {
        inserted.push({ table: t._name, values });
        return Promise.resolve();
      },
    }),
    update: (t: { _name: string }) => ({
      set: (set: Record<string, unknown>) => {
        updated.push({ table: t._name, set });
        const where = () => Object.assign(Promise.resolve(), { returning: async () => [{ id: "u1", email: set.email }] });
        return { where };
      },
    }),
  };
  return {
    db: {
      select: () => chain(),
      ...writer,
      transaction: async (fn: (tx: typeof writer) => unknown) => fn(writer),
    },
    accountDeletionCodesTable: table("account_deletion_codes"),
    usersTable: table("users"),
  };
});
vi.mock("../auth", () => ({ hashPassword: (p: string) => `hashed:${p}` }));
vi.mock("../email", () => ({
  sendEmail: vi.fn(async () => ({ id: "m1" })),
  EmailNotConfiguredError: class extends Error {},
}));
vi.mock("../logger", () => ({ logger: { error: vi.fn() } }));

import { sendEmail } from "../email";
import {
  confirmEmailChange,
  hashEmailChangeCode,
  hasMovedAwayFrom,
  movedAwayHash,
  requestEmailChangeCode,
} from "../email-change";

const googleUser = { id: "u1", email: "old@example.com", firstName: "Chege", passwordHash: null };
const passwordUser = { ...googleUser, passwordHash: "existing" };
const now = new Date("2026-10-05T10:00:00Z");

beforeEach(() => {
  selectResults.length = 0;
  inserted.length = 0;
  updated.length = 0;
  selectThrows = false;
  vi.mocked(sendEmail).mockClear();
});

describe("asking to move an account to a new email", () => {
  it("sends a code bound to the new address, to the new address", async () => {
    selectResults.push([googleUser], []);
    const result = await requestEmailChangeCode("u1", " New@Example.com ", now);

    expect(result).toEqual({ needsPassword: true });
    expect(inserted[0].values.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toEqual(["new@example.com"]);
    const code = /(\d{6})/.exec(vi.mocked(sendEmail).mock.calls[0][0].html)![1];
    expect(inserted[0].values.codeHash).toBe(hashEmailChangeCode("new@example.com", code));
  });

  it("does not ask an account that has a password for another", async () => {
    selectResults.push([passwordUser], []);
    expect(await requestEmailChangeCode("u1", "new@example.com", now)).toEqual({ needsPassword: false });
  });

  it("refuses the address it already has", async () => {
    selectResults.push([googleUser]);
    await expect(requestEmailChangeCode("u1", "OLD@example.com", now)).rejects.toMatchObject({ status: 400 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("refuses an address that is another account's, and says what to do instead", async () => {
    selectResults.push([googleUser], [{ id: "someone-else" }]);
    await expect(requestEmailChangeCode("u1", "taken@example.com", now)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("Give this budget to someone else"),
    });
    expect(inserted).toEqual([]);
  });
});

describe("confirming the move", () => {
  const pending = (email: string, code: string) => [{ id: "c1", codeHash: hashEmailChangeCode(email, code) }];

  it("moves the account, sets a password for a Google-only account, and lets go of the old address", async () => {
    selectResults.push(pending("new@example.com", "123456"), [googleUser], []);
    const user = await confirmEmailChange("u1", { email: "new@example.com", code: "123456", password: "longenough" }, now);

    expect(user.email).toBe("new@example.com");
    expect(updated).toContainEqual({ table: "account_deletion_codes", set: { usedAt: now } });
    expect(updated.find((u) => u.table === "users")?.set).toMatchObject({ email: "new@example.com", passwordHash: "hashed:longenough" });
    expect(inserted).toContainEqual({
      table: "account_deletion_codes",
      values: { userId: "u1", codeHash: movedAwayHash("old@example.com"), expiresAt: now, usedAt: now },
    });
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toEqual(["old@example.com"]);
  });

  it("keeps an existing password as it is", async () => {
    selectResults.push(pending("new@example.com", "123456"), [passwordUser], []);
    await confirmEmailChange("u1", { email: "new@example.com", code: "123456" }, now);
    expect(updated.find((u) => u.table === "users")?.set).not.toHaveProperty("passwordHash");
  });

  it("rejects a code sent for a different address", async () => {
    selectResults.push(pending("other@example.com", "123456"));
    await expect(confirmEmailChange("u1", { email: "new@example.com", code: "123456", password: "longenough" }, now))
      .rejects.toMatchObject({ status: 400 });
    expect(updated).toEqual([]);
  });

  it("checks the password before spending the code", async () => {
    selectResults.push(pending("new@example.com", "123456"), [googleUser]);
    await expect(confirmEmailChange("u1", { email: "new@example.com", code: "123456", password: "short" }, now))
      .rejects.toMatchObject({ status: 400, message: expect.stringContaining("password") });
    expect(updated).toEqual([]);
  });
});

describe("the moved-away check on Google sign-in", () => {
  it("answers yes only for a recorded move", async () => {
    selectResults.push([{ id: "r1" }]);
    expect(await hasMovedAwayFrom("u1", "old@example.com")).toBe(true);
    selectResults.push([]);
    expect(await hasMovedAwayFrom("u1", "old@example.com")).toBe(false);
  });

  it("never breaks sign-in: a failed lookup answers no", async () => {
    selectThrows = true;
    expect(await hasMovedAwayFrom("u1", "old@example.com")).toBe(false);
  });
});
