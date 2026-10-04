import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  existingPersonalOutcome,
  freeGroupName,
  isBudgetEmpty,
  isSharedGroupKind,
  KEPT_PERSONAL_BUDGET_NAME,
  makePersonalRefusal,
} from "../workspace-conversion";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const unused = { expenses: 0, bankEntries: 0, contributions: 0, savingsGoals: 0, payouts: 0, bankOpeningBalances: 0 };

describe("an unused Personal budget", () => {
  it("is one with nothing recorded and no opening balance", () => {
    expect(isBudgetEmpty(unused)).toBe(true);
  });

  it.each(Object.keys(unused))("is no longer unused once it has %s", (key) => {
    expect(isBudgetEmpty({ ...unused, [key]: 1 })).toBe(false);
  });
});

describe("what the swap does to the Personal budget a person already has", () => {
  it("nothing, when there is none", () => {
    expect(existingPersonalOutcome(null)).toBe("none");
  });
  it("removes it when it is unused", () => {
    expect(existingPersonalOutcome({ empty: true })).toBe("erase");
  });
  it("keeps it as a group when anything is recorded in it, so nothing is deleted by surprise", () => {
    expect(existingPersonalOutcome({ empty: false })).toBe("keep-as-group");
  });
});

describe("the name a kept Personal budget gets", () => {
  it("is 'Old personal budget' when that is free", () => {
    expect(freeGroupName(KEPT_PERSONAL_BUDGET_NAME, new Set(["family"]))).toBe("Old personal budget");
  });
  it("is the next free number when it is taken, whatever the case or spacing", () => {
    expect(freeGroupName(KEPT_PERSONAL_BUDGET_NAME, new Set(["old personal budget", "old personal budget 2"])))
      .toBe("Old personal budget 3");
  });
});

describe("who may make a group their Personal budget", () => {
  const owner = { userId: "me", role: "owner", name: "Chege" };

  it("its owner, when nobody else is in it", () => {
    expect(makePersonalRefusal("me", [owner])).toBeNull();
  });

  it("not somebody who is not its owner", () => {
    const refusal = makePersonalRefusal("me", [{ ...owner, role: "admin" }]);
    expect(refusal?.status).toBe(403);
  });

  it("not somebody who is not in it at all", () => {
    expect(makePersonalRefusal("me", [{ ...owner, userId: "them" }])?.status).toBe(404);
  });

  it("not while another member is in it, naming them", () => {
    const refusal = makePersonalRefusal("me", [owner, { userId: "l", role: "member", name: "Lydiah" }]);
    expect(refusal?.status).toBe(409);
    expect(refusal?.message).toContain("Lydiah is also in it");
  });

  it("not while even a read-only viewer is in it, because they would lose access too", () => {
    const refusal = makePersonalRefusal("me", [owner, { userId: "v", role: "viewer", name: "Wanjiru" }]);
    expect(refusal?.status).toBe(409);
    expect(refusal?.message).toContain("Wanjiru (viewer)");
  });

  it("lists everyone else when there are several", () => {
    const refusal = makePersonalRefusal("me", [
      owner,
      { userId: "a", role: "member", name: "A" },
      { userId: "b", role: "admin", name: "B" },
      { userId: "c", role: "viewer", name: "C" },
    ]);
    expect(refusal?.message).toContain("A, B and C (viewer) are also in it");
  });
});

describe("the kind a Personal budget may become", () => {
  it("is any Shared group kind, never personal", () => {
    expect(isSharedGroupKind("family")).toBe(true);
    expect(isSharedGroupKind("chama")).toBe(true);
    expect(isSharedGroupKind("personal")).toBe(false);
    expect(isSharedGroupKind(undefined)).toBe(false);
  });
});

describe("the conversion transactions", () => {
  const lib = read("../workspace-conversion.ts");

  it("clears the old Personal budget's owner before giving the target it (the column is unique)", () => {
    const swap = lib.slice(lib.indexOf("export async function makeGroupPersonal"));
    const cleared = swap.indexOf("set({ privateOwnerUserId: null, name, kind: GROUP_KIND.OTHER })");
    const given = swap.indexOf("set({ privateOwnerUserId: userId, kind: GROUP_KIND.PERSONAL })");
    expect(cleared).toBeGreaterThan(0);
    expect(given).toBeGreaterThan(cleared);
  });

  it("erases only through the shared eraseGroupData, inside a transaction", () => {
    expect(lib).toContain('import { eraseGroupData, type DbOrTransaction } from "./account-deletion"');
    expect(lib.match(/eraseGroupData\(tx, /g)?.length).toBe(2);
  });
});

describe("DELETE /group is unchanged", () => {
  it("still refuses a Personal budget", () => {
    const group = read("../../routes/group.ts");
    expect(group.slice(group.indexOf('router.delete("/group"'))).toContain("A Personal budget can't be deleted on its own");
  });
});
