import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The two clients have to apply the same rules to the same money.
 *
 * Wording may differ between them; what a form accepts may not. An expense the
 * phone refuses and the browser saves is not a cosmetic difference - it is two
 * apps disagreeing about what a valid record is, writing to one database.
 *
 * The phone's rules are a module that can be run
 * (mobile-budget/lib/expenseValidation.ts, tested there). The browser's are
 * spread through its page, so they are checked by reading it.
 */
const web = readFileSync(new URL("./expenses.tsx", import.meta.url), "utf8");
const mobileRules = readFileSync(
  new URL("../../../mobile-budget/lib/expenseValidation.ts", import.meta.url),
  "utf8",
);
const webContributions = readFileSync(
  new URL("../components/record-contributions.tsx", import.meta.url),
  "utf8",
);
const mobileContributions = readFileSync(
  new URL("../../../mobile-budget/app/record-contributions.tsx", import.meta.url),
  "utf8",
);

describe("an expense cannot be dated into the future", () => {
  it("is refused by the phone", () => {
    expect(mobileRules).toContain("input.date > input.todayIso");
  });

  it("is refused by the browser too, when adding and when editing", () => {
    // This was the gap: the browser had no bound at all for a manager, so the
    // same expense the phone rejected saved cleanly here.
    expect(web).toContain("if (addForm.date > today) {");
    expect(web).toContain("if (editForm.date > today) {");
  });

  it("is not offered by the browser's date picker either", () => {
    // Previously max was only set for ordinary members, as part of pinning
    // them to today; a manager's picker was unbounded in both directions.
    expect(web).toContain("max={today}");
    expect(web).not.toContain("max={canManageExpenses ? undefined : today}");
  });

  it("still lets a manager backdate", () => {
    // The fix caps the top end only. Recording last week's shopping is normal;
    // recording next week's is not.
    expect(web).toContain("min={canManageExpenses ? undefined : today}");
  });
});

describe("recording contributions already agreed, and must keep agreeing", () => {
  it.each([
    ["the earliest date allowed", "getFullYear() - 3"],
    ["the guard on the range", "< earliestDate"],
  ])("uses the same rule for %s", (_label, marker) => {
    expect(webContributions).toContain(marker);
    expect(mobileContributions).toContain(marker);
  });

  it("refuses a future date on both", () => {
    expect(webContributions).toContain("> todayString");
    expect(mobileContributions).toContain("> todayStr");
  });

  it("needs two names, somebody ticked, and somewhere for the money on both", () => {
    for (const source of [webContributions, mobileContributions]) {
      expect(source).toContain("Add at least two names");
      expect(source).toContain("Nobody ticked");
      expect(source).toContain("No bank account yet");
    }
  });
});
