import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isKnowledgeKind, KNOWLEDGE_KINDS } from "../budget-knowledge";

const route = readFileSync("src/routes/budget-knowledge.ts", "utf8");
const lib = readFileSync("src/lib/budget-knowledge.ts", "utf8");
const index = readFileSync("src/index.ts", "utf8");

// Named accounts, your business's numbers, other budgets' payees and nicknames
// lived on one phone (10 Oct 2026): kept per budget on the server now.
describe("what a budget taught Jamvi, on the server", () => {
  it("knows only its own kinds of document", () => {
    expect(KNOWLEDGE_KINDS).toEqual(["named-payees", "owner-business", "other-budget-rules", "payee-nicknames"]);
    expect(isKnowledgeKind("named-payees")).toBe(true);
    expect(isKnowledgeKind("anything")).toBe(false);
  });

  it("is one document per budget and kind, gone with the budget", () => {
    expect(lib).toContain('PRIMARY KEY ("group_id", "kind")');
    expect(lib).toContain('REFERENCES "groups"("id") ON DELETE CASCADE');
  });

  it("is read by anyone in the budget, written whole by its owner or admins, never too big", () => {
    expect(route).toMatch(/router\.get\("\/knowledge"/);
    expect((route.match(/requireGroupManager\(req, res\)/g) ?? []).length).toBe(1);
    expect(route).toContain("MAX_DOC_BYTES");
  });

  it("is made after the server listens", () => {
    expect(index.indexOf("void ensureBudgetKnowledge();")).toBeGreaterThan(index.indexOf("app.listen("));
  });
});
