import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/joint-account.ts", "utf8").replace(/\r\n/g, "\n");
const schema = readFileSync("../../lib/db/src/schema/budget.ts", "utf8");
const migration = readFileSync("../../lib/db/migrations/0045_bank_entry_notes.sql", "utf8");
const journal = readFileSync("../../lib/db/migrations/meta/_journal.json", "utf8");

// A plain note against a bank entry, the same as expenses already have. Never read by any
// total or report; nothing else in the app looks at this column.
describe("bank entries can carry a note", () => {
  it("is a nullable column, added without touching anything already there", () => {
    expect(schema).toContain('notes: text("notes"),');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "notes" text;');
    expect(migration).not.toContain("UPDATE");
  });

  it("is registered after the migration before it", () => {
    const entries = JSON.parse(journal).entries as Array<{ tag: string; when: number }>;
    const mine = entries.find((entry) => entry.tag === "0045_bank_entry_notes");
    const previous = entries.find((entry) => entry.tag === "0044_debt_entry_links");
    expect(mine!.when).toBeGreaterThan(previous!.when);
  });

  it("is accepted on creating a deposit or a disbursement", () => {
    expect(route).toContain("notes: z.string().trim().max(1000).optional(),");
    expect(route).toContain('notes: parsed.data.notes?.trim() || null,');
  });

  it("omitted on an edit leaves it as it was; null or empty clears it", () => {
    expect(route).toContain("notes: z.string().trim().max(1000).nullable().optional(),");
    expect(route.match(/\.\.\.\(parsed\.data\.notes === undefined \? \{\} : \{ notes: parsed\.data\.notes\?\.trim\(\) \|\| null \}\)/g)?.length).toBe(3);
  });

  it("comes back on every read of a transaction", () => {
    expect(route).toContain("notes: tx.notes ?? null,");
  });
});
