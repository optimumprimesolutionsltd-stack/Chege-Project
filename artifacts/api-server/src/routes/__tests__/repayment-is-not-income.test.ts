    // Two are drizzle columns; the third is raw SQL in the group-funding query.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("../../lib/db/src/schema/budget.ts", "utf8");
const migration = readFileSync("../../lib/db/migrations/0038_settlement_is_not_income.sql", "utf8");
const journal = readFileSync("../../lib/db/migrations/meta/_journal.json", "utf8");
const bank = readFileSync("src/routes/joint-account.ts", "utf8");
const dashboard = readFileSync("src/routes/dashboard.ts", "utf8");
const contributors = readFileSync("src/routes/contributors.ts", "utf8");

// Money lent coming back reaches the account like any deposit — but you had it
// once already. Counted again, every income figure inflates by money that was
// never earned, and nothing on screen would say why.
describe("a repayment is recorded as a settlement", () => {
  it("names the party it settles, on the transaction", () => {
    expect(schema).toContain('settlesContributorId: integer("settles_contributor_id")');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "settles_contributor_id" integer');
  });

  it("keeps the money when the party is deleted", () => {
    // Removing somebody must not silently delete what moved between you.
    expect(schema).toContain('{ onDelete: "set null" }');
    expect(migration).toContain("ON DELETE SET NULL");
  });

  it("indexes what every money-in figure now filters on", () => {
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS "joint_account_transactions_settles_idx"');
  });

  it("is registered after the migration before it", () => {
    const entries = JSON.parse(journal).entries as Array<{ tag: string; when: number }>;
    const mine = entries.find((entry) => entry.tag === "0038_settlement_is_not_income");
    const previous = entries.find((entry) => entry.tag === "0037_contributors_become_parties");
    expect(mine!.when).toBeGreaterThan(previous!.when);
  });

  it("refuses a party from another budget", () => {
    // A settlement pointing outside the group would exclude money from income
    // on the word of a stranger.
    expect(bank).toContain('res.status(400).json({ error: "That person is not in this budget." });');
  });

  it("never gives a repayment an income source", () => {
    // Borrowed money shares the branch now, for the same reason: neither is
    // being earned. See borrowing-is-not-income.test.ts.
    expect(bank).toContain("settlesContributorId || isBorrowing ? null : contributorSplits ? null : incomeSourceId ?? null,");
  });
});

// Attribution alone cannot say it. A deposit with no member and no income
// source is still counted — as money held for the group.
describe("every figure that counts money in leaves it out", () => {
  it("is absent from what each member contributed", () => {
    expect(dashboard).toContain("AND t.settles_contributor_id IS NULL");
    expect(dashboard).toContain("AND ${jointAccountTxTable.settlesContributorId} IS NULL");
  });

  it("is absent from the income streams, both halves", () => {
    expect((dashboard.match(/AND deposit\.settles_contributor_id IS NULL/g) ?? []).length).toBe(2);
  });

  it("is absent from the period totals, amount and count alike", () => {
    expect((dashboard.match(/AND bank_tx\.settles_contributor_id IS NULL/g) ?? []).length).toBe(2);
  });

  it("is absent from the contribution grid, the statement and group funding", () => {
    expect((contributors.match(/settlesContributorId\} IS NULL/g) ?? []).length).toBe(2);
    expect(contributors).toContain("AND t.settles_contributor_id IS NULL");
  });
});

describe("but it stays a transaction", () => {
  it("is not hidden from the ledger or the activity feed", () => {
    // It really did reach the account. Hiding it would make the app disagree
    // with the bank, which is the one thing reconciliation depends on.
    const listing = dashboard.slice(dashboard.indexOf("const deposits = await db"));
    expect(listing.slice(0, 900)).not.toContain("settles_contributor_id");
    expect(listing.slice(0, 900)).not.toContain("settlesContributorId");
  });
});
