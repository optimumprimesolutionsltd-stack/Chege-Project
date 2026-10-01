import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ai = readFileSync("src/routes/ai.ts", "utf8");
const names = readFileSync("src/routes/mpesa-names.ts", "utf8");

describe("Search finds bank and M-Pesa entries by more than their description", () => {
  it("looks at notes and the M-Pesa code", () => {
    expect(ai).toContain("ilike(jointAccountTxTable.notes, pattern),");
    expect(ai).toContain("ilike(jointAccountTxTable.mpesaReceipt, pattern),");
  });

  it("looks at the name M-Pesa gave a renamed entry, once that table exists", () => {
    expect(ai).toContain("...(mpesaNamesReady()");
    expect(ai).toContain("EXISTS (SELECT 1 FROM mpesa_entry_names named WHERE named.transaction_id = ${jointAccountTxTable.id} AND named.name ILIKE ${pattern})");
  });

  it("keeps names only for the active budget's own entries", () => {
    expect(names).toContain("and(eq(jointAccountTxTable.groupId, groupId), inArray(jointAccountTxTable.id, ids))");
    expect(names).toContain("const valid = parsed.data.names.filter((row) => ok.has(row.transactionId));");
  });

  it("creates its table after the server starts", () => {
    expect(readFileSync("src/index.ts", "utf8")).toContain("void ensureMpesaNames();");
  });
});
