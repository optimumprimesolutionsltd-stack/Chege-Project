import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanRules, MAX_KEY } from "../payee-rules";

const route = readFileSync("src/routes/payee-rules.ts", "utf8");
const lib = readFileSync("src/lib/payee-rules.ts", "utf8");
const index = readFileSync("src/index.ts", "utf8");

// What Jamvi was taught about payees used to live on one phone only: lost on a
// reinstall, invisible to the web and other admins (Teach Jamvi, 10 Oct 2026).
describe("payee rules on the server", () => {
  it("keeps only short, non-empty text rules", () => {
    expect(cleanRules({ "#ref:5846630": " Rent ", "src:acme ltd": "12", empty: "", n: 5, [" "]: "x", ["k".repeat(MAX_KEY + 1)]: "y" }))
      .toEqual({ "#ref:5846630": "Rent", "src:acme ltd": "12" });
    expect(cleanRules(null)).toEqual({});
    expect(cleanRules(["a"])).toEqual({});
  });

  it("is one row per budget and key, gone with the budget", () => {
    expect(lib).toContain('PRIMARY KEY ("group_id", "key")');
    expect(lib).toContain('REFERENCES "groups"("id") ON DELETE CASCADE');
  });

  it("is read by anyone in the budget, changed only by its owner or admins", () => {
    expect(route).toMatch(/router\.get\("\/payee-rules"[\s\S]*?getActiveGroupId/);
    expect((route.match(/requireGroupManager\(req, res\)/g) ?? []).length).toBe(2);
  });

  it("is made after the server listens, and says when it is not ready", () => {
    expect(index.indexOf("void ensurePayeeRules();")).toBeGreaterThan(index.indexOf("app.listen("));
    expect(route).toContain("ready: payeeRulesReady()");
  });
});
