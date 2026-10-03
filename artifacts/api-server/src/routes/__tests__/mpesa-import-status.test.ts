import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/mpesa-import.ts", "utf8");
const status = route.slice(route.indexOf('router.get("/mpesa/import/status"'), route.indexOf('router.post("/mpesa/import/preview"'));

describe("whether a workspace has imported from M-Pesa", () => {
  it("looks only in the active workspace, for any entry with an M-Pesa code", () => {
    expect(status).toContain("const groupId = getActiveGroupId(req, res);");
    expect(status).toContain("and(eq(jointAccountTxTable.groupId, groupId), isNotNull(jointAccountTxTable.mpesaReceipt))");
    expect(status).toContain("res.json({ imported: Boolean(row) });");
  });
});

describe("the home screen's M-Pesa summary", () => {
  const summary = route.slice(route.indexOf('router.get("/mpesa/summary"'), route.indexOf("export default router;"));

  it("reads only the active workspace's entries that carry an M-Pesa code", () => {
    expect(summary).toContain("const groupId = getActiveGroupId(req, res);");
    expect(summary).toContain("and(eq(jointAccountTxTable.groupId, groupId), isNotNull(jointAccountTxTable.mpesaReceipt))");
  });

  it("totals one calendar month, and dates the latest entry across all of them", () => {
    expect(summary).toContain("gte(jointAccountTxTable.date, from), lte(jointAccountTxTable.date, to)");
    expect(summary).toContain(".where(fromMpesa)");
    expect(summary).toContain("latestDate: latest?.date ?? null");
  });

  it("falls back to this month for a missing or nonsense month", () => {
    expect(summary).toContain("askedMonth >= 1 && askedMonth <= 12 ? askedMonth : now.getMonth() + 1");
  });
});
