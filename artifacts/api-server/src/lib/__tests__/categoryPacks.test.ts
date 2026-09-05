import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  GROUP_KIND: {
    PERSONAL: "personal",
    FAMILY: "family",
    CHAMA: "chama",
    CLUB: "club",
    TEAM: "team",
    STUDENT_GROUP: "student_group",
    OTHER: "other",
  },
}));

import {
  CATEGORY_PACKS,
  categoryPackChildren,
  categoryPackForKind,
  normalizedCategoryPackKind,
  priorityTiersForKind,
} from "../categoryPacks.js";

describe("category packs", () => {
  it("provides expense-only recommendations for every supported workspace kind", () => {
    expect(Object.keys(CATEGORY_PACKS)).toEqual(
      expect.arrayContaining(["personal", "family", "chama", "club", "team", "student_group", "other"]),
    );
    for (const categories of Object.values(CATEGORY_PACKS)) {
      expect(categories).not.toHaveLength(0);
      expect(categories.map((category) => category.name.toLocaleLowerCase("en-US")))
        .not.toContain("other");
      expect(categories.map((category) => category.name.toLocaleLowerCase("en-US")))
        .not.toEqual(expect.arrayContaining(["income", "contributions"]));
    }
  });

  it("does not expose legacy semantic aliases in recommendations", () => {
    const legacyAliases = new Set(["rent", "accommodation", "food & meals", "groceries", "tuition & fees", "school fees"]);
    for (const categories of Object.values(CATEGORY_PACKS)) {
      for (const category of categories) {
        expect(legacyAliases.has(category.name.toLocaleLowerCase("en-US"))).toBe(false);
      }
    }
  });

  it("uses the family pack for legacy rows with no recognized kind", () => {
    expect(normalizedCategoryPackKind(undefined)).toBe("family");
    expect(categoryPackForKind("future-kind")).toBe(CATEGORY_PACKS.family);
  });

  it("uses Chama language instead of household language for Chama priority tiers", () => {
    const labels = priorityTiersForKind("chama").map((tier) => tier.label);
    expect(labels).toEqual([
      "Core Commitments",
      "Welfare & Administration",
      "Operations & Transport",
      "Communication & Growth",
      "Flexible Spending",
    ]);
    expect(labels).not.toContain("Survival Essentials");
    expect(labels).not.toContain("Health & Education");
  });

  it("uses student-specific expenses and priority language for Student groups", () => {
    expect(categoryPackForKind("student_group").map((category) => category.name)).toEqual([
      "School fees & classes",
      "Books & supplies",
      "Meals",
      "Transport",
      "Airtime & data",
      "Events & activities",
      "Welfare",
      "Administration",
    ]);
    expect(priorityTiersForKind("student_group").map((tier) => tier.label)).toEqual([
      "Academic Commitments",
      "Student Welfare",
      "Group Operations",
      "Activities & Growth",
      "Flexible Spending",
    ]);
  });
});

describe("suggested mini-ledgers", () => {
  it("never repeats a name inside a pack", () => {
    // A budget allows one category of a given name, and the apply flow inserts
    // with onConflictDoNothing. A repeated name would therefore not fail
    // loudly - it would just silently fail to create one of the ledgers.
    for (const [kind, categories] of Object.entries(CATEGORY_PACKS)) {
      const names: string[] = [];
      for (const category of categories) {
        names.push(category.name.trim().toLowerCase());
        for (const child of category.children ?? []) {
          names.push(child.trim().toLowerCase());
        }
      }
      expect(new Set(names).size, `duplicate name in the ${kind} pack`).toBe(names.length);
    }
  });

  it("suggests no amount for a ledger", () => {
    // Children are created with a budget of 0 on purpose: guessing somebody
    // else's electricity bill is worse than leaving it blank.
    for (const categories of Object.values(CATEGORY_PACKS)) {
      for (const category of categories) {
        for (const child of category.children ?? []) {
          expect(typeof child).toBe("string");
          expect(child.trim()).not.toBe("");
        }
      }
    }
  });

  it("groups every pack, so no budget type is left without ledgers", () => {
    for (const [kind, categories] of Object.entries(CATEGORY_PACKS)) {
      const withChildren = categories.filter((category) => (category.children?.length ?? 0) > 0);
      expect(withChildren.length, `the ${kind} pack suggests no sub-categories`).toBeGreaterThan(0);
    }
  });

  it("maps parent names to their ledgers for a given budget type", () => {
    const household = categoryPackChildren("family");
    expect(household.get("Utilities")).toContain("Garbage");
    expect(household.get("Utilities")).toContain("Security");
    expect(household.get("Food")).toContain("Groceries");
    expect(household.get("Education")).toContain("School trips");

    // A different kind of budget suggests a different shape entirely.
    const chama = categoryPackChildren("chama");
    expect(chama.has("Utilities")).toBe(false);
    expect(chama.get("Welfare")).toContain("Bereavement");
  });
});
