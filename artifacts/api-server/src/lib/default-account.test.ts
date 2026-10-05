import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_ACCOUNT_NAME, ensureBudgetHasAnAccount } from "./default-account";

// A new person read their M-Pesa messages and Save did nothing: a Personal
// budget was made with no account, and every entry needs one (5 Oct 2026).
describe("every budget has an account to save into", () => {
  it("starts with M-Pesa", () => {
    expect(DEFAULT_ACCOUNT_NAME).toBe("M-Pesa");
  });

  it("adds one only to a budget with none, and never twice", async () => {
    const sent: string[] = [];
    await ensureBudgetHasAnAccount(42, { execute: async (query) => { sent.push(JSON.stringify(query)); return []; } });
    expect(sent[0]).toContain("WHERE NOT EXISTS (SELECT 1 FROM \\\"bank_accounts\\\" WHERE \\\"group_id\\\" = ");
    expect(sent[0]).toContain("ON CONFLICT DO NOTHING");
  });

  it("is done when a Personal budget is set up, and for older budgets at startup", () => {
    expect(readFileSync("src/lib/personalWorkspace.ts", "utf8")).toContain("await ensureBudgetHasAnAccount(workspace.id, tx);");
    expect(readFileSync("src/index.ts", "utf8")).toContain("void ensureEveryBudgetHasAnAccount();");
  });

  it("Save says why when there is still no account, on the phone and the web", () => {
    expect(readFileSync("../mobile-budget/app/mpesa-import.tsx", "utf8")).toContain("Alert.alert('No account to save into'");
    expect(readFileSync("../family-budget/src/pages/mpesa-import.tsx", "utf8")).toContain('title: "No account to save into"');
  });
});
