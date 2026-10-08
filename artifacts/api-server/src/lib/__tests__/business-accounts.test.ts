import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { inPersonalAccount, notInBusinessAccount, setBusinessAccountsReadyForTests } from "../business-accounts";
import { notAReversal } from "../reversal-links";
import { buildIncomeLedger } from "../income-ledger";

const chunks = (fragment: unknown) => JSON.stringify((fragment as { queryChunks: unknown[] }).queryChunks);
const dashboard = readFileSync("src/routes/dashboard.ts", "utf8");
const ai = readFileSync("src/routes/ai.ts", "utf8");
const index = readFileSync("src/index.ts", "utf8");

afterEach(() => setBusinessAccountsReadyForTests(false));

// "When opening a bank account, one should be asked if it's for business or
// personal" - and a business account is kept out of personal (8 Oct 2026).
describe("a business's own bank account", () => {
  it("changes nothing until its table exists, which the server makes after listening", () => {
    expect(chunks(inPersonalAccount(sql`t.account_id`))).not.toContain("business_bank_accounts");
    expect(chunks(notInBusinessAccount(sql`t.id`))).not.toContain("business_bank_accounts");
    expect(index.indexOf("void ensureBusinessAccounts();")).toBeGreaterThan(index.indexOf("app.listen("));
  });

  it("its money in leaves every personal income figure", () => {
    setBusinessAccountsReadyForTests(true);
    expect(chunks(notAReversal(sql`t.id`))).toContain("JOIN business_bank_accounts bba ON bba.account_id = bt.account_id");
  });

  it("its spending leaves every personal spending figure, Ask Jamvi included", () => {
    expect((dashboard.match(/\$\{inPersonalAccount\(/g) ?? []).length).toBe(9);
    expect(ai).toContain("${inPersonalAccount(jointAccountTxTable.accountId)}");
  });

  it("but the Business report keeps it, and lists each business account", () => {
    expect(dashboard).toContain("loadIncomeLedger(groupId, from, to, null, { personal: false })");
    expect(dashboard).toContain("const businessAccounts = await businessAccountSummary(groupId, from, to);");
    expect(dashboard).toContain("}), businessAccounts });");
  });

  it("the income ledger totals it, and money from your business, apart from income", () => {
    const ledger = buildIncomeLedger({
      from: "2026-10-01",
      to: "2026-10-31",
      deposits: [
        { id: 1, date: "2026-10-02", description: "Sales", amount: 9000, incomeSourceId: null, makerName: null, accountName: "Biz", kind: "business_account" },
        { id: 2, date: "2026-10-03", description: "Drawings", amount: 4000, incomeSourceId: null, makerName: null, accountName: "M-Pesa", kind: "owner" },
      ],
      splits: [],
      streamNames: new Map(),
      costsByStream: new Map(),
    });
    expect(ledger.otherMoneyIn.inBusinessAccounts).toBe(9000);
    expect(ledger.otherMoneyIn.fromYourBusiness).toBe(4000);
    expect(ledger.entries).toEqual([]);
  });
});
