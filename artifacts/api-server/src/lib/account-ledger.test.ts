import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The SQL itself was checked against a real Postgres on 2,687 entries (5 Oct
// 2026, docs/account-list-paging.md); CI has no database, so these keep the
// shape that check relied on.
describe("an account's totals come from the database", () => {
  const ledger = readFileSync("src/lib/account-ledger.ts", "utf8");
  const route = readFileSync("src/routes/joint-account.ts", "utf8");

  it("gives each row its own running balance, in the list's order reversed", () => {
    expect(ledger).toContain("OVER (ORDER BY ${tx.date} ASC, ${tx.createdAt} ASC, ${tx.id} ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)");
    expect(ledger).toContain(".orderBy(desc(tx.date), desc(tx.createdAt), desc(tx.id))");
  });

  it("counts only what has happened by today, and leaves moves between accounts out of in and out", () => {
    expect(ledger).toContain("const happened = sql`${tx.date} <= ${today}::date`;");
    expect(ledger.match(/\$\{tx\.bankTransferId\} IS NULL/g)?.length).toBe(2);
  });

  it("is what the account list uses, not sums over every entry in code", () => {
    expect(route).toContain("ledgerEntries(db, groupId, ledgerAccountId),");
    expect(route).toContain("ledgerTotals(db, groupId, ledgerAccountId, today),");
    expect(route).not.toContain("let balanceCursor");
  });
});
