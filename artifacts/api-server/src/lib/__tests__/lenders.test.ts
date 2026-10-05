import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FULIZA_PARTY_NAME } from "../lenders";

const lib = readFileSync("src/lib/lenders.ts", "utf8");
const routes = readFileSync("src/routes/contributors.ts", "utf8");

// "for loans to have their independent names" (5 Oct 2026): Fuliza was
// "Safaricom PLC" in Who owes who, next to M-Shwari, KCB M-PESA and Hustler Fund.
describe("Fuliza in Who owes who", () => {
  it("is called Fuliza wherever the server adds it", () => {
    expect(FULIZA_PARTY_NAME).toBe("Fuliza");
    expect(routes).not.toContain('"Safaricom PLC"');
    expect((routes.match(/name: FULIZA_PARTY_NAME/g) ?? []).length).toBe(2);
  });

  it("renames only the Safaricom PLC Jamvi added, and only when there is no Fuliza yet", () => {
    expect(lib).toContain('const FORMER_FULIZA_NAME = "safaricom plc";');
    expect(lib).toContain("lower(btrim(other.name)) = 'fuliza'");
  });

  it("is renamed when Who owes who is listed, never at the cost of the list", () => {
    expect(routes).toContain("await renameFormerFulizaParty(groupId).catch(() => {});");
  });
});
