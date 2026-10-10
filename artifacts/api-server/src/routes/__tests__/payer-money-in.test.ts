import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/entries-to-sort.ts", "utf8");
const find = route.slice(route.indexOf('router.post("/payer-money-in/find"'), route.indexOf('const refileSchema'));
const refile = route.slice(route.indexOf('router.post("/payer-money-in/refile"'));

// "How do we correct this instantly" (10 Oct 2026): a payer's earlier money in,
// moved to the source the person just chose, in one go.
describe("a payer's earlier money in", () => {
  it("is found by its description in the body, never the address, in this budget only", () => {
    expect(find).toContain("payerQuery.safeParse(req.body)");
    expect(find).toContain(`WHERE t."group_id" = \${groupId}`);
    expect(find).toContain(`AND t."income_source_id" IS NOT NULL`);
    expect(find).toContain(`AND t."bank_transfer_id" IS NULL`);
  });

  it("moves only money in that had a source, to a source of this budget, by a manager, with its owner", () => {
    expect(refile).toContain("if (!requireGroupManager(req, res)) return;");
    expect(refile).toContain(`WHERE "id" = \${parsed.data.incomeSourceId} AND "group_id" = \${groupId}`);
    expect(refile).toContain(`SET "income_source_id" = \${parsed.data.incomeSourceId}, "made_by_id" = \${owner}`);
    expect(refile).toContain(`AND "type" = 'deposit'`);
    expect(refile).toContain(`AND "income_source_id" IS NOT NULL`);
  });
});
