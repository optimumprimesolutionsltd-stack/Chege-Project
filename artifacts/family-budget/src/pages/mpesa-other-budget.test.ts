import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

// "would also want the work done still from the mpesa import" — a line can be sent straight
// to a different budget the person manages (a side hustle run as its own project), without
// switching away from the budget on screen.
describe("recording a line in a different budget, from the import (web)", () => {
  const page = read("src/pages/mpesa-import.tsx");

  it("offers only budgets the person actually manages", () => {
    expect(page).toContain('workspace.id !== group?.id && (workspace.role === "owner" || workspace.role === "admin")');
  });

  it("reads that budget without ever switching the one on screen to it", () => {
    expect(page).toContain("fetchOtherBudgetOptions(");
    expect(page).not.toContain("selectWorkspace");
  });

  it("caches what it reads, so a second line for the same budget costs nothing further", () => {
    expect(page).toContain("const cached = otherBudgetOptions[groupId];\n    if (cached) return cached;");
  });

  it("records it there by naming the budget explicitly, not by switching to it", () => {
    expect(page).toContain('"x-jamvi-workspace": String(groupId)');
    expect(page).toContain("createDepositInOtherBudget");
    expect(page).toContain("createDisbursementInOtherBudget");
  });

  it("counts it apart from this budget's own income and spending", () => {
    expect(page).toContain("summary.toOtherBudgets");
  });
});
