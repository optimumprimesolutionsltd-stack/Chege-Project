import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (u: string) => readFileSync(fileURLToPath(new URL(u, import.meta.url)), "utf8").replace(/\r\n/g, "\n");

// Reported as: "source of income not there" — a shared-group deposit with
// nobody chosen offered only "Other", though the group has saved streams.
describe("picking an income stream names its owner as the depositor", () => {
  it("web lists every member's streams while nobody is chosen", () => {
    const web = read("./bank.tsx");
    expect(web).toContain('queryKey: ["income-sources", "__group__"]');
    expect(web).toContain("(depositorIds.length === 0 ? groupSources : depositSources).map");
    expect(web).toContain("setDepositorIds([picked.userId])");
  });

  it("mobile does the same", () => {
    const mobile = read("../../../mobile-budget/app/(tabs)/bank.tsx");
    expect(mobile).toContain("if (!selected && src.userId && depositorIds.length === 0) setDepositorIds([src.userId]);");
  });
});
