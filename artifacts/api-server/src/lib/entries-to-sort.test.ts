import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NOT_SURE_CATEGORY } from "./entries-to-sort";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

// Asked for 2 Oct 2026: entries saved as "Not sure" while importing old
// statements need a reminder to sort them out.
describe("entries to sort out", () => {
  const route = read("../routes/entries-to-sort.ts");

  it("lists spending under Not sure yet and marked money in still without a source", () => {
    expect(NOT_SURE_CATEGORY).toBe("Not sure yet");
    expect(route).toContain("lower(${jointAccountTxTable.expenseCategory}) = lower(${NOT_SURE_CATEGORY})");
    expect(route).toContain("${jointAccountTxTable.incomeSourceId} IS NULL");
    expect(route).toContain('"group_id" = ${groupId}');
  });

  it("marks only deposits of the active budget", () => {
    expect(route).toContain('eq(jointAccountTxTable.type, "deposit")');
    expect(route).toContain("eq(jointAccountTxTable.groupId, groupId)");
  });

  it("is made at startup, registered, and recorded as migration 0053", () => {
    expect(read("../index.ts")).toContain("void ensureEntriesToSort();");
    expect(read("../routes/index.ts")).toContain("router.use(entriesToSortRouter);");
    const migration = read("../../../../lib/db/migrations/0053_entries_to_sort.sql");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "entries_to_sort"');
    expect(read("../../../../lib/db/migrations/meta/_journal.json")).toContain('"tag": "0053_entries_to_sort"');
  });
});
