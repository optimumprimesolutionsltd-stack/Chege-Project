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
