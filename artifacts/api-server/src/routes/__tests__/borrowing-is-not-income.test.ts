import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("../../lib/db/src/schema/budget.ts", "utf8");
const migration = readFileSync("../../lib/db/migrations/0040_borrowing_is_not_income.sql", "utf8");
const journal = readFileSync("../../lib/db/migrations/meta/_journal.json", "utf8");
const bank = readFileSync("src/routes/joint-account.ts", "utf8");
const dashboard = readFileSync("src/routes/dashboard.ts", "utf8");
const contributors = readFileSync("src/routes/contributors.ts", "utf8");

// The mirror of 0038. A loan paid out to you reaches the account like any
// deposit, but it is not earnings — you will pay it back. Counted as income,
// the month looks better than it was every time somebody borrows, and the more
// they borrow the better it looks.
describe("a deposit can say it was borrowed", () => {
  it("is recorded on the transaction", () => {
    expect(schema).toContain('isBorrowing: boolean("is_borrowing").notNull().default(false)');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "is_borrowing" boolean NOT NULL DEFAULT false');
  });

  it("cannot be inferred from the settlement column instead", () => {
    // Borrowing from a party sets settles_contributor_id and could be told
    // apart by it. Borrowing against a tracked debt category sets nothing, and
    // would be counted. So it is recorded plainly.
    expect(bank).toContain("isBorrowing: z.boolean().optional(),");
  });

  it("invents nothing for what is already recorded", () => {
    // A deposit already entered was entered as ordinary money in, and nothing
    // here knows which of them were loans.
    expect(migration).not.toContain("UPDATE");
  });

  it("is registered after the migration before it", () => {
    const entries = JSON.parse(journal).entries as Array<{ tag: string; when: number }>;
    const mine = entries.find((entry) => entry.tag === "0040_borrowing_is_not_income");
    const previous = entries.find((entry) => entry.tag === "0039_mpesa_receipt");
    expect(mine!.when).toBeGreaterThan(previous!.when);
  });

  it("never gives borrowed money an income source", () => {
    expect(bank).toContain("settlesContributorId || isBorrowing ? null : contributorSplits ? null : incomeSourceId ?? null,");
  });
});

// Every figure that learned to leave a repayment out has to leave a loan out
// for the same reason, and there is no single place they are written.
describe("every figure that counts money in leaves it out", () => {
  it("is excluded everywhere the settlement is, and nowhere else", () => {
    const settlementFilters =
      (dashboard.match(/settles_contributor_id IS NULL/g) ?? []).length +
      (dashboard.match(/settlesContributorId\} IS NULL/g) ?? []).length +
      (contributors.match(/settles_contributor_id IS NULL/g) ?? []).length +
      (contributors.match(/settlesContributorId\} IS NULL/g) ?? []).length;
    const borrowingFilters =
      (dashboard.match(/AND NOT \w+\.is_borrowing/g) ?? []).length +
      (dashboard.match(/AND NOT \$\{jointAccountTxTable\.isBorrowing\}/g) ?? []).length +
      (contributors.match(/AND NOT \w+\.is_borrowing/g) ?? []).length +
      (contributors.match(/AND NOT \$\{jointAccountTxTable\.isBorrowing\}/g) ?? []).length;
    expect(borrowingFilters).toBe(settlementFilters);
    // The per-stream income trend duplicates the same two deposit branches
    // (split, legacy) as the single-month funding query, so both counts grew
    // by 2 together when it was added.
    expect(borrowingFilters).toBe(12);
  });
});

describe("but it stays a transaction", () => {
  it("is not hidden from the ledger or the activity feed", () => {
    // It really did reach the account. Hiding it would make the app disagree
    // with the bank, which is what reconciliation depends on.
    const listing = dashboard.slice(dashboard.indexOf("const deposits = await db"));
    expect(listing.slice(0, 900)).not.toContain("is_borrowing");
    expect(listing.slice(0, 900)).not.toContain("isBorrowing");
  });
});
