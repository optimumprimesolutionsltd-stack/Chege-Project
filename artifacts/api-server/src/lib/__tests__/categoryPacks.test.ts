import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  GROUP_KIND: {
    PERSONAL: "personal",
    FAMILY: "family",
    CHAMA: "chama",
    CLUB: "club",
    TEAM: "team",
    OTHER: "other",
  },
}));

import {
  CATEGORY_PACKS,
  categoryPackForKind,
  normalizedCategoryPackKind,
} from "../categoryPacks.js";

describe("category packs", () => {
  it("provides expense-only recommendations for every supported workspace kind", () => {
    expect(Object.keys(CATEGORY_PACKS)).toEqual(
      expect.arrayContaining(["personal", "family", "chama", "club", "team", "other"]),
    );
    for (const categories of Object.values(CATEGORY_PACKS)) {
      expect(categories).not.toHaveLength(0);
      expect(categories.map((category) => category.name.toLocaleLowerCase("en-US")))
        .not.toContain("other");
      expect(categories.map((category) => category.name.toLocaleLowerCase("en-US")))
        .not.toEqual(expect.arrayContaining(["income", "contributions"]));
    }
  });

  it("uses the family pack for legacy rows with no recognized kind", () => {
    expect(normalizedCategoryPackKind(undefined)).toBe("family");
    expect(categoryPackForKind("future-kind")).toBe(CATEGORY_PACKS.family);
  });
});