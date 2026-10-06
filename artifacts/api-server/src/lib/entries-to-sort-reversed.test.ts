import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A payment saved as Not sure, then reversed, stayed in Sort them out and looked
// like spending still to be filed (Alice Mwangi -3,500, 6 Oct 2026).
describe("Sort them out leaves reversals off", () => {
  const route = readFileSync("src/routes/entries-to-sort.ts", "utf8");
  const list = route.slice(route.indexOf('router.get("/entries-to-sort"'), route.indexOf("router.post(\"/entries-to-sort/money-in-without-source\""));

  it("skips both halves of a linked reversal", () => {
    expect(list).toContain('r."reversal_transaction_id" = ${jointAccountTxTable.id} OR r."original_transaction_id" = ${jointAccountTxTable.id}');
    expect(list).toContain("${marked}) ${notReversed}`");
  });

  it("only once the reversal links can be read", () => {
    expect(list).toContain("const notReversed = reversalLinksReady()");
  });
});
