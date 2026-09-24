import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (u: string) => readFileSync(fileURLToPath(new URL(u, import.meta.url)), "utf8").replace(/\r\n/g, "\n");

// Reported as: "cant make another entry after saving unless i restart".
describe("after a day of banking is saved", () => {
  const web = read("./bank-day.tsx");
  const mobile = read("../../../mobile-budget/app/bank-day.tsx");

  it("refreshes the account with the generated query keys, not a hand-written one", () => {
    for (const source of [web, mobile]) {
      expect(source).toContain("getGetJointAccountQueryKey()");
      expect(source).toContain("getGetJointAccountsQueryKey()");
      expect(source).not.toMatch(/queryKey: \[["']joint-account["']\]/);
    }
  });

  it("web starts the next entry from a clean line once everything is saved", () => {
    expect(web).toContain("current.every((candidate) => candidate.saved) ? [blankRow(chargeCategory)] : current");
    expect(web).toContain('data-testid="day-last-recorded"');
  });
});
