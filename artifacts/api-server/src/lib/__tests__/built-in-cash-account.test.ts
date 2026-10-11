import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(__dirname, path), "utf8");

// "The app should have a cash account hardcoded" (11 Oct 2026): cash paid in at an
// agent is a move from Cash into M-Pesa, and with no Cash account it had nowhere to go.
describe("every budget has a Cash account", () => {
  const lib = read("../default-account.ts");

  it("is made with every new budget, Personal and Shared, unless one with cash in its name exists", () => {
    expect(lib).toContain('export const CASH_ACCOUNT_NAME = "Cash";');
    expect(lib).toContain("await ensureCashAccount(groupId, executor);");
    expect(lib).toContain('"name" ~* ');
    expect(lib).toContain("mcash");
    expect(read("../../routes/group.ts")).toContain("await ensureCashAccount(created.id, tx);");
  });

  it("is given to every budget already made, once at start-up", () => {
    const startup = lib.slice(lib.indexOf("export async function ensureEveryBudgetHasAnAccount"));
    expect(startup).toContain("SELECT g.\"id\", ${CASH_ACCOUNT_NAME}, 0");
    expect(startup).toContain('"Gave budgets a Cash account"');
  });
});
