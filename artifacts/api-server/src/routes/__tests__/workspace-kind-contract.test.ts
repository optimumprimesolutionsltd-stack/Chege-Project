import { describe, expect, it } from "vitest";
import {
  CreateSharedGroupBody,
  GetBudgetCategoryRecommendationsResponse,
  UpdateGroupBody,
} from "@workspace/api-zod";

describe("workspace kind API contracts", () => {
  it("keeps existing create clients compatible by defaulting kind to family", () => {
    expect(CreateSharedGroupBody.parse({ name: "Household" }).kind).toBe("family");
  });

  it("accepts team, Student group, and other workspace kinds on create and update", () => {
    expect(CreateSharedGroupBody.parse({ name: "Delivery team", kind: "team" }).kind).toBe("team");
    expect(CreateSharedGroupBody.parse({ name: "Campus welfare", kind: "student_group" }).kind).toBe("student_group");
    expect(UpdateGroupBody.parse({ name: "Anything", kind: "other" }).kind).toBe("other");
  });

  it("contracts recommendation previews as existing and missing expense buckets", () => {
    expect(GetBudgetCategoryRecommendationsResponse.parse({
      kind: "team",
      existing: [{ name: "Tools", budgetAmount: 0, priority: 1, color: "#7C3AED", exists: true }],
      missing: [{ name: "Travel", budgetAmount: 0, priority: 2, color: "#8B5CF6", exists: false }],
    })).toMatchObject({ kind: "team" });
  });
});