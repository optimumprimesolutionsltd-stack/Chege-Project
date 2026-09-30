import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bank = readFileSync("src/routes/joint-account.ts", "utf8");
const tidy = bank.slice(bank.indexOf("async function importTidyTargets"), bank.indexOf('router.get("/joint-account/statement.pdf"'));

// "Yes, do the one-tap fix": charges filed under School fees, payments put down to the group.
describe("tidying imported entries", () => {
  it("moves only M-Pesa charges to M-Pesa charges, leaving Fuliza charges alone", () => {
    expect(tidy).toContain("lower(btrim(tx.expense_category)) NOT IN ('m-pesa charges', 'fuliza charges')");
    expect(tidy).toContain("tx.charge_for_transaction_id IS NOT NULL AND parent.mpesa_receipt IS NOT NULL");
  });

  it("gives imported payments to whoever tidies, in the one account only", () => {
    expect(tidy).toContain("AND tx.account_id = ${accountId}");
    expect(tidy).toContain("AND tx.made_by_id IS NULL");
    expect(tidy).toContain(".set({ madeById: req.user!.id })");
  });

  it("is previewed by anyone and done only by an owner or admin", () => {
    const post = tidy.slice(tidy.indexOf('router.post("/joint-account/import-tidy"'));
    expect(post).toContain("if (!requireGroupManager(req, res)) return;");
  });
});
