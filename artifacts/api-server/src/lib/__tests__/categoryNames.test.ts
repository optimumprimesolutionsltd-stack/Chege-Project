import { describe, expect, it } from "vitest";
import { canonicalExpenseCategoryName, normalizeExpenseCategoryName } from "../categoryNames.js";

describe("expense category normalization", () => {
  it("canonicalizes legacy housing aliases", () => {
    expect(canonicalExpenseCategoryName("Rent")).toBe("Housing");
    expect(canonicalExpenseCategoryName("  accommodation ")).toBe("Housing");
  });

  it("trims ordinary custom categories without changing their meaning", () => {
    expect(canonicalExpenseCategoryName("  School transport ")).toBe("School transport");
    expect(normalizeExpenseCategoryName("  School transport ")).toBe("school transport");
  });
});
