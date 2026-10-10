import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { coversParts } from "../transaction-splits";

const lib = readFileSync("src/lib/transaction-splits.ts", "utf8");
const bank = readFileSync("src/routes/joint-account.ts", "utf8");
const difference = readFileSync("src/routes/mpesa-import.ts", "utf8");
const duplicates = readFileSync("src/lib/possible-duplicates.ts", "utf8");
const routes = readFileSync("src/routes/transaction-splits.ts", "utf8");
const index = readFileSync("src/index.ts", "utf8");

// "Money sent to her should be to cover rent or school fees ... rent shouldn't
// appear as blank while the money lies in family support" (10 Oct 2026).
// Run against Postgres (PGlite) while written: covers by month, twice changes
// nothing, move newest first, delete a part / undo puts it back, refusals.
describe("what a person's money covers, for one payment", () => {
  const plan = [{ category: "Rent", monthly: 15000 }, { category: "School fees", monthly: 5000 }];
  it("fills each in order, up to its amount for the month", () => {
    expect(coversParts(20000, plan, new Map())).toEqual([{ category: "Rent", amount: 15000 }, { category: "School fees", amount: 5000 }]);
    expect(coversParts(8000, plan, new Map())).toEqual([{ category: "Rent", amount: 8000 }]);
    expect(coversParts(10000, plan, new Map([["Rent", 1_200_000]]))).toEqual([{ category: "Rent", amount: 3000 }, { category: "School fees", amount: 5000 }]);
    expect(coversParts(3000, plan, new Map([["Rent", 1_500_000], ["School fees", 500_000]]))).toEqual([]);
  });
});

describe("parts are entries of their own, kept apart only where codes are matched", () => {
  it("never a move, savings, fee, loan, debt, business money or reversal", () => {
    for (const guard of [`"bank_transfer_id" IS NULL`, `"savings_goal_id" IS NULL`, `"charge_for_transaction_id" IS NULL`, `"expense_id" IS NULL`, `"is_lending" = false`, `FROM "debt_entry_links" d`, `FROM "owner_business_money" o`, `FROM "reversal_links" r`]) {
      expect(lib).toContain(guard);
    }
  });
  it("Find the difference counts a part with its payment's message; Possible duplicates never calls one typed by hand", () => {
    expect(difference).toContain("rootOf.has(row.id) ? receiptOfId.get(rootOf.get(row.id)!) ?? null");
    expect(duplicates).toContain("${notASplitPart(sql`joint_account_transactions.id`)}");
  });
  it("deleting a part puts it back; a split payment's amount cannot change alone", () => {
    expect(bank).toContain("if (await beforeDelete(tx, groupId, existing.id)) return { deleted: existing };");
    expect(bank).toContain('res.status(409).json({ error: "This payment is split. Undo the split first, then change the amount." });');
  });
  it("made after the server listens; changes by managers only; categories must be the budget's", () => {
    expect(index.indexOf("void ensureTransactionSplits();")).toBeGreaterThan(index.indexOf("app.listen("));
    for (const path of ["/transaction-splits/split", "/transaction-splits/covers", "/transaction-splits/move", "/transaction-splits/undo"]) {
      const block = routes.slice(routes.indexOf(`router.post("${path}"`));
      expect(block.slice(0, block.indexOf("});"))).toContain("if (!requireGroupManager(req, res)) return;");
    }
    expect(routes).toContain("is not one of this budget's categories.");
  });
  it("a person's covers are applied once per payment, and counted for the month even when the payment became a part itself", () => {
    expect(lib).toContain(`UNION ALL SELECT 1 FROM "covers_applied" WHERE "transaction_id" = \${id} LIMIT 1`);
    expect(lib).toContain(`FROM "covers_applied" ca`);
  });
});
