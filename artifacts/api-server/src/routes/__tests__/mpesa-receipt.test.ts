import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("../../lib/db/src/schema/budget.ts", "utf8");
const migration = readFileSync("../../lib/db/migrations/0039_mpesa_receipt.sql", "utf8");
const journal = readFileSync("../../lib/db/migrations/meta/_journal.json", "utf8");
const bank = readFileSync("src/routes/joint-account.ts", "utf8");
const parserTypes = readFileSync("src/lib/mpesa-parser/types.ts", "utf8");

// A parsed message can be pasted twice — the same SMS forwarded, a list
// re-imported, a tap repeated on a slow connection. Without something to
// recognise it by, each paste is a fresh posting and the balance drifts by
// whatever was counted again, silently, because both postings look correct.
describe("a posting can carry the receipt it came from", () => {
  it("keeps the code the parser already extracts", () => {
    expect(parserTypes).toContain("transactionId: string | null;");
    expect(schema).toContain('mpesaReceipt: text("mpesa_receipt")');
  });

  it("is unique within a budget, not across all of them", () => {
    // Two budgets can hold the same message: somebody records a payment in
    // their own budget and again in a group's, and both are true.
    expect(migration).toContain('ON "joint_account_transactions" ("group_id", "mpesa_receipt")');
  });

  it("leaves hand-entered postings out of the rule", () => {
    // Most postings have no receipt, and they must not be forced to differ
    // from one another.
    expect(migration).toContain('WHERE "mpesa_receipt" IS NOT NULL');
  });

  it("invents nothing for what is already recorded", () => {
    expect(migration).not.toContain("UPDATE");
  });

  it("is registered after the migration before it", () => {
    const entries = JSON.parse(journal).entries as Array<{ tag: string; when: number }>;
    const mine = entries.find((entry) => entry.tag === "0039_mpesa_receipt");
    const previous = entries.find((entry) => entry.tag === "0038_settlement_is_not_income");
    expect(mine!.when).toBeGreaterThan(previous!.when);
  });
});

describe("recording the same message twice is refused", () => {
  it("checks before writing, on both doors money comes through", () => {
    expect(bank).toContain("const receiptClash = await alreadyRecorded(groupId, parsed.data.mpesaReceipt);");
    expect(bank).toContain("const disbursementClash = await alreadyRecorded(groupId, parsed.data.mpesaReceipt);");
    expect((bank.match(/res\.status\(409\)\.json\((?:receiptClash|disbursementClash)\)/g) ?? []).length).toBe(2);
  });

  it("says what the duplicate is, not merely that it is one", () => {
    // Somebody pasting a message a second time is told what they are looking
    // at rather than told "no".
    expect(bank).toContain("is already recorded, on ${existing.date} as");
    expect(bank).toContain("recordedOn: existing.date,");
  });

  it("treats one code typed two ways as one code", () => {
    expect(bank).toContain(".transform((code) => code.toUpperCase())");
  });

  it("refuses something that is not a receipt at all", () => {
    expect(bank).toContain("z.string().trim().min(6).max(20).regex(/^[A-Za-z0-9]+$/)");
  });

  it("stores it on deposits, withdrawals and savings transfers", () => {
    expect((bank.match(/mpesaReceipt: parsed\.data\.mpesaReceipt \?\? null,/g) ?? []).length).toBe(3);
  });

  it("stays optional, because most postings are typed by hand", () => {
    expect((bank.match(/mpesaReceipt: MpesaReceipt\.optional\(\),/g) ?? []).length).toBe(3);
    expect(bank).toContain("if (!receipt) return null;");
  });
});
