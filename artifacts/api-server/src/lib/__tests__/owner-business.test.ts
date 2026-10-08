import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { notOwnerBusinessMoney, ownerBusinessReady, setOwnerBusinessReadyForTests } from "../owner-business-money";
import { notAReversal } from "../reversal-links";

const chunks = (fragment: unknown) => JSON.stringify((fragment as { queryChunks: unknown[] }).queryChunks);
const index = readFileSync("src/index.ts", "utf8");
const lib = readFileSync("src/lib/owner-business.ts", "utf8");
const toSort = readFileSync("src/lib/entries-to-sort.ts", "utf8");
const bank = readFileSync("src/routes/joint-account.ts", "utf8");
const routes = readFileSync("src/routes/index.ts", "utf8");

afterEach(() => setOwnerBusinessReadyForTests(false));

// "If the user has a business, we can specify business account numbers..." -
// counted as owner's drawings (8 Oct 2026).
describe("money between the owner and their business", () => {
  it("changes no figure until its table exists, and the server makes it after listening", () => {
    expect(ownerBusinessReady()).toBe(false);
    expect(chunks(notOwnerBusinessMoney(sql`t.id`))).not.toContain("owner_business_money");
    expect(index).toContain("void ensureOwnerBusiness();");
    expect(index.indexOf("void ensureOwnerBusiness();")).toBeGreaterThan(index.indexOf("app.listen("));
  });

  it("is left out of every income figure, through the condition each already adds", () => {
    setOwnerBusinessReadyForTests(true);
    expect(chunks(notAReversal(sql`t.id`))).toContain("owner_business_money obm WHERE obm.transaction_id = ");
  });

  it("money in loses its income source and any debt; money out loses its category, so neither is income or spending", () => {
    expect(lib).toContain(`SET "income_source_id" = NULL, "is_borrowing" = false, "settles_contributor_id" = NULL`);
    expect(lib).toContain(`SET "expense_category" = NULL, "is_lending" = false, "settles_contributor_id" = NULL`);
    expect(lib).toContain(`DELETE FROM "debt_entry_links"`);
  });

  it("never touches moves between your own accounts, savings, fees or reversals", () => {
    expect(lib).toContain(`AND t."bank_transfer_id" IS NULL`);
    expect(lib).toContain(`AND t."savings_goal_id" IS NULL`);
    expect(lib).toContain(`AND t."charge_for_transaction_id" IS NULL`);
    expect(lib).toContain(`"reversal_links" r`);
  });

  it("is not gathered back into Sort them out as money in with no source", () => {
    expect(toSort).toContain('${notOwnerBusinessMoney(sql`t."id"`)}');
  });

  it("an edit asks for no category or income source", () => {
    expect(bank).toContain("const notIncome = isBorrowing || settlesContributorId !== null || await isOwnerBusinessMoney(existing.id);");
    expect(bank).toContain("const editingALoanOut = existing.isLending === true || await isOwnerBusinessMoney(existing.id);");
  });

  it("unmarked, it goes back to being sorted out", () => {
    expect(lib).toContain('SET "expense_category" = ${NOT_SURE_CATEGORY}');
    expect(lib).toContain(`INSERT INTO "entries_to_sort" ("transaction_id", "group_id") VALUES (\${transactionId}, \${groupId})`);
    expect(routes).toContain("router.use(ownerBusinessRouter);");
  });
});
