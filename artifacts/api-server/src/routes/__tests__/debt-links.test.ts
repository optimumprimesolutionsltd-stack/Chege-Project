import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/debt-links.ts", "utf8").replace(/\r\n/g, "\n");
const migration = readFileSync("../../lib/db/migrations/0044_debt_entry_links.sql", "utf8");
const journal = readFileSync("../../lib/db/migrations/meta/_journal.json", "utf8");
const schema = readFileSync("../../lib/db/src/schema/budget.ts", "utf8");

// Which person a debt entry was for, kept apart from the transaction so no existing
// figure can change and a missing table cannot break an ordinary bank entry.
describe("debt entry links", () => {
  it("live in their own table, cascading with the entry, its budget and its person", () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "debt_entry_links"');
    expect(migration).toContain('REFERENCES "joint_account_transactions"("id") ON DELETE CASCADE');
    expect(migration).toContain('REFERENCES "group_contributors"("id") ON DELETE CASCADE');
    expect(migration).not.toContain("ALTER TABLE");
    expect(migration).not.toContain("UPDATE");
    expect(schema).toContain('pgTable("debt_entry_links"');
  });

  it("store one of four kinds, checked in the database", () => {
    expect(migration).toContain("CHECK (\"kind\" IN ('pay-back', 'lend', 'repaid', 'borrowed'))");
  });

  it("is registered after the migration before it", () => {
    const entries = JSON.parse(journal).entries as Array<{ tag: string; when: number; idx: number }>;
    const mine = entries.find((entry) => entry.tag === "0044_debt_entry_links")!;
    const previous = entries.find((entry) => entry.tag === "0043_charge_belongs_to_its_posting")!;
    expect(mine.when).toBeGreaterThan(previous.when);
    expect(mine.idx).toBe(previous.idx + 1);
  });

  it("only link an entry and a person that belong to the active budget", () => {
    expect(route).toContain("getActiveGroupId(req, res)");
    expect(route).toContain("eq(jointAccountTxTable.groupId, groupId)");
    expect(route).toContain("eq(groupContributorsTable.groupId, groupId)");
    expect(route).toContain("okTransactions.has(link.transactionId) && okParties.has(link.partyId)");
  });

  it("are read only for entries in the active budget", () => {
    expect(route).toContain("eq(debtEntryLinksTable.groupId, groupId)");
  });

  it("touch no transaction column, so no existing figure can change", () => {
    expect(route).not.toContain(".update(jointAccountTxTable)");
    expect(route).not.toContain("settlesContributorId");
  });
});
