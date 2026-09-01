import { describe, expect, it } from "vitest";
import { dedupeIncomeSources, normalizeIncomeSourceName } from "../income-source-utils";

type Source = {
  id: number;
  userId: string;
  name: string;
  isMain: boolean;
};

describe("income source deduplication", () => {
  it("normalizes case and surrounding whitespace", () => {
    expect(normalizeIncomeSourceName("  Salary Or Wages ")).toBe("salary or wages");
  });

  it("shows one canonical option when an existing member has duplicate rows", () => {
    const rows: Source[] = [
      { id: 28, userId: "member-a", name: "Salary or wages", isMain: true },
      { id: 29, userId: "member-a", name: " salary OR WAGES ", isMain: false },
      { id: 30, userId: "member-a", name: "Freelance work", isMain: false },
    ];

    expect(dedupeIncomeSources(rows)).toEqual([rows[0], rows[2]]);
  });

  it("keeps equal names belonging to different members", () => {
    const rows: Source[] = [
      { id: 1, userId: "member-a", name: "Salary", isMain: false },
      { id: 2, userId: "member-b", name: "Salary", isMain: false },
    ];

    expect(dedupeIncomeSources(rows)).toEqual(rows);
  });
});