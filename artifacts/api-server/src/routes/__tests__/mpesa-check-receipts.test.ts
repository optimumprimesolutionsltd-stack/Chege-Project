import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/mpesa-import.ts", "utf8").replace(/\r\n/g, "\n");
const block = route.slice(route.indexOf('router.post("/mpesa/import/check-receipts"'), route.indexOf("const reportSchema"));

// A statement is read on the person's own device; the server is only asked which
// of its receipt codes this budget already has.
describe("checking receipts for a statement", () => {
  it("is limited to the active budget", () => {
    expect(block).toContain("getActiveGroupId(req, res)");
    expect(block).toContain("eq(jointAccountTxTable.groupId, groupId)");
  });

  it("accepts only receipt codes, never statement text", () => {
    expect(route).toContain("regex(/^[A-Z0-9]{8,15}$/");
    expect(route).toContain(".max(2_000)");
  });

  it("logs and stores nothing", () => {
    expect(block).not.toMatch(/logger|console\.|insert\(|update\(/);
  });
});
