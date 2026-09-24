import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BUDGET_SECTION,
  budgetingAppliesTo,
  defaultSectionsForKind,
  sectionsForKindAndPurpose,
} from "@workspace/db/schema";

// Budgeting without amounts is worse than no budgeting: every screen reads
// "KES 0 of KES 0 (0%)", every category looks on track, and the over-budget
// warnings mean nothing — the app looks broken rather than empty.
describe("whether budgeting applies", () => {
  it("applies to somebody here to track spending", () => {
    expect(budgetingAppliesTo("budgeting")).toBe(true);
  });

  it("does not apply to saving or clearing a debt", () => {
    expect(budgetingAppliesTo("saving")).toBe(false);
    expect(budgetingAppliesTo("debt")).toBe(false);
  });

  it("applies when nobody was asked, which is every budget made before this", () => {
    // Silence must not remove a section somebody already had.
    expect(budgetingAppliesTo(null)).toBe(true);
    expect(budgetingAppliesTo(undefined)).toBe(true);
  });
});

describe("the sections a new budget starts with", () => {
  it("drops only the budget section, leaving what the kind decided", () => {
    const withBudgeting = sectionsForKindAndPurpose("family", "budgeting");
    const without = sectionsForKindAndPurpose("family", "debt");
    expect(withBudgeting).toEqual(defaultSectionsForKind("family"));
    expect(without).toEqual(withBudgeting.filter((section) => section !== BUDGET_SECTION.BUDGET));
    // Everything else survives — a saver still has expenses, bank and reports.
    expect(without).toContain(BUDGET_SECTION.EXPENSES);
    expect(without).toContain(BUDGET_SECTION.BANK);
  });

  it("changes nothing for a kind that never had budgeting", () => {
    // A chama's defaults do not include the budget section, so purpose has
    // nothing to remove and cannot accidentally add one.
    for (const purpose of ["budgeting", "saving", "debt"] as const) {
      expect(sectionsForKindAndPurpose("chama", purpose)).toEqual(defaultSectionsForKind("chama"));
    }
  });

  it("is unchanged when no purpose was given", () => {
    expect(sectionsForKindAndPurpose("family", null)).toEqual(defaultSectionsForKind("family"));
  });
});

describe("the rule is applied where budgets are created", () => {
  const route = readFileSync(new URL("../../routes/group.ts", import.meta.url), "utf8");

  it("seeds a new group's sections from kind and purpose together", () => {
    expect(route).toContain("sectionsForKindAndPurpose(parsed.data.kind, parsed.data.purpose ?? null)");
    expect(route).not.toContain("enabledSections: [...defaultSectionsForKind(parsed.data.kind)]");
  });
});

// The phone cannot import @workspace/db without pulling drizzle into its
// bundle, so the rule is stated twice. This is what keeps the two in step.
describe("the mobile client states the same rule", () => {
  const onboarding = readFileSync(
    new URL("../../../../mobile-budget/lib/onboarding.ts", import.meta.url),
    "utf8",
  );

  it("agrees on which purposes switch budgeting off", () => {
    expect(onboarding).toContain('return goal !== "saving" && goal !== "debt";');
  });

  it("skips the amounts step rather than showing it and ignoring the answer", () => {
    const chooser = readFileSync(
      new URL("../../../../mobile-budget/app/budget-chooser.tsx", import.meta.url),
      "utf8",
    );
    expect(chooser).toContain("const budgetingApplies = budgetingAppliesTo(draft.budgetGoal ?? null);");
    expect(chooser).toContain("const lastStep = budgetingApplies ? 5 : 4;");
    // A resumed draft must not land on a step this budget no longer has.
    expect(chooser).toContain("const resumeCeiling = budgetingAppliesTo(saved.budgetGoal ?? null) ? 5 : 4;");
  });

  it("brings the Budget tab back once a real amount exists", () => {
    const tabs = readFileSync(
      new URL("../../../../mobile-budget/hooks/useTabFlags.ts", import.meta.url),
      "utf8",
    );
    expect(tabs).toContain("const showBudget = budgetSectionOn || hasBudgetedAmount;");
    // Nobody should have to find a setting to undo an answer they gave before
    // they knew what the app did.
    expect(tabs).toContain("budgetAmount ?? 0) > 0");
  });
});
