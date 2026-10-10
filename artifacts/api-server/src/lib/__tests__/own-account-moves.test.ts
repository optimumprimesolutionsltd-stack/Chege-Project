import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCOUNT_DIGITS, referenceDigits } from "../own-account-moves";

const lib = readFileSync("src/lib/own-account-moves.ts", "utf8");
const bank = readFileSync("src/routes/joint-account.ts", "utf8");
const phoneReference = readFileSync("../mobile-budget/lib/payeeLearning.ts", "utf8");

// "Money between a user's personal account to his other personal account or
// business should have an automatic logic ... user needs not be asked" (10 Oct 2026).
describe("saved payments to your own account, once its number is known", () => {
  it("reads the account number the way the phone does", () => {
    expect(referenceDigits("Equity Paybill Account (0870193430866)")).toBe("0870193430866");
    expect(referenceDigits("KCB Paybill (1234-5678-90) ")).toBe("1234567890");
    expect(referenceDigits("Naivas Supermarket")).toBe("");
    expect(phoneReference).toContain(String.raw`description.match(/\(([^)]*)\)\s*$/)?.[1].replace(/\D/g, '') ?? ''`);
    expect(ACCOUNT_DIGITS).toBe(5);
  });

  it("only what still waits: Not sure yet, or money in with no source; never a move, savings, fee, debt, reversal or business money", () => {
    expect(lib).toContain(`(t."expense_category" IS NULL OR t."expense_category" = \${NOT_SURE_CATEGORY})`);
    expect(lib).toContain(`t."type" = 'deposit' AND t."income_source_id" IS NULL`);
    for (const guard of [
      `AND t."bank_transfer_id" IS NULL`,
      `AND t."savings_goal_id" IS NULL`,
      `AND t."charge_for_transaction_id" IS NULL`,
      `AND t."expense_id" IS NULL`,
      `AND t."is_borrowing" = false`,
      `AND t."is_lending" = false`,
      `FROM "debt_entry_links" d`,
      `FROM "owner_business_money" o`,
      `FROM "reversal_links" r`,
      `AND t."account_id" <> \${accountId}`,
    ]) expect(lib).toContain(guard);
    // The LIKE only narrows; the bracketed number has to be exactly the account's.
    expect(lib).toContain("filter((row) => referenceDigits(row.description) === digits)");
  });

  it("each becomes one half of a move, the other half made on the account, and leaves Sort them out", () => {
    expect(lib).toContain(`SET "bank_transfer_id" = \${transferId}, "bank_transfer_account_id" = \${accountId},`);
    expect(lib).toContain(`\${row.type === "disbursement" ? "deposit" : "disbursement"}`);
    expect(lib).toContain(`DELETE FROM "entries_to_sort"`);
  });

  it("runs when an account is added with a number or given one, and never fails the account's save", () => {
    expect(bank).toContain("const movedEntries = await movedToOwnAccount(req, groupId, account.id, parsed.data.accountNumber);");
    expect(bank).toContain("const movedEntries = parsed.data.accountNumber ? await movedToOwnAccount(req, groupId, account.id, parsed.data.accountNumber) : 0;");
    expect(bank).toContain(`req.log.error({ err: error, groupId, accountId }, "Could not move saved entries to an own account");`);
  });
});
