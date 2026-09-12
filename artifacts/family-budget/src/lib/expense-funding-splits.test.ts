import { describe, expect, it } from "vitest";
import {
  buildDirectSplits,
  describeDirectSplitProblem,
  directSplitProblem,
  directSplitsFrom,
  directSplitsTotal,
} from "./expense-funding-splits";

describe("reading the editable portions off a stored expense", () => {
  it("takes the direct portions that name a saved source", () => {
    const { sourceIds, amounts, editable } = directSplitsFrom([
      { amount: 600, incomeSourceId: 3, fromBank: false },
      { amount: 400, incomeSourceId: 7, fromBank: false },
    ]);
    expect(sourceIds).toEqual([3, 7]);
    expect(amounts).toEqual({ "3": "600", "7": "400" });
    expect(editable).toBe(true);
  });

  it("ignores the bank portion, which is chosen elsewhere", () => {
    const { sourceIds, editable } = directSplitsFrom([
      { amount: 500, fromBank: true, accountId: 9 },
      { amount: 500, incomeSourceId: 3, fromBank: false },
    ]);
    expect(sourceIds).toEqual([3]);
    expect(editable).toBe(true);
  });

  it("sums a source that appears twice into one row", () => {
    // Splitting a source against itself is not a distinction anybody made on
    // purpose, and two rows for one source cannot be represented in a picker.
    const { sourceIds, amounts } = directSplitsFrom([
      { amount: 300, incomeSourceId: 3, fromBank: false },
      { amount: 200, incomeSourceId: 3, fromBank: false },
    ]);
    expect(sourceIds).toEqual([3]);
    expect(amounts).toEqual({ "3": "500" });
  });

  it("refuses to claim a historical portion is editable", () => {
    // Portions from before income sources were saved objects carry a label and
    // no id. There is nothing to select that would represent them, so the
    // caller must keep the expense on the preserve path.
    const { editable } = directSplitsFrom([
      { amount: 600, label: "Old salary", fromBank: false },
      { amount: 400, incomeSourceId: 7, fromBank: false },
    ]);
    expect(editable).toBe(false);
  });

  it("reports nothing editable for a bank-only or empty expense", () => {
    expect(directSplitsFrom([{ amount: 900, fromBank: true }]).editable).toBe(false);
    expect(directSplitsFrom([]).editable).toBe(false);
    expect(directSplitsFrom(undefined).sourceIds).toEqual([]);
  });
});

describe("whether the portions can be saved", () => {
  const amounts = { "3": "600", "7": "400" };

  it("accepts portions that add up", () => {
    expect(directSplitProblem({ total: 1000, sourceIds: [3, 7], amounts })).toBeNull();
  });

  it("asks for a source when none is chosen", () => {
    expect(directSplitProblem({ total: 1000, sourceIds: [], amounts })).toEqual({ kind: "none-selected" });
  });

  it("reports a blank portion as blank, not as a shortfall", () => {
    // A total computed from an empty box is not a second thing to fix.
    const problem = directSplitProblem({ total: 1000, sourceIds: [3, 7], amounts: { "3": "600", "7": "" } });
    expect(problem).toEqual({ kind: "portion-missing" });
  });

  it("names what is still unfunded", () => {
    const problem = directSplitProblem({ total: 1000, sourceIds: [3, 7], amounts: { "3": "600", "7": "300" } });
    expect(problem).toEqual({ kind: "short", by: 100 });
    expect(describeDirectSplitProblem(problem!)).toContain("100");
  });

  it("names the overshoot", () => {
    const problem = directSplitProblem({ total: 1000, sourceIds: [3, 7], amounts: { "3": "600", "7": "600" } });
    expect(problem).toEqual({ kind: "over", by: 200 });
    expect(describeDirectSplitProblem(problem!)).toContain("200");
  });

  it("tolerates under a shilling of rounding, as the phone does", () => {
    const problem = directSplitProblem({
      total: 1000,
      sourceIds: [3, 7],
      amounts: { "3": "600.5", "7": "399.7" },
    });
    expect(problem).toBeNull();
  });

  it("does not measure against an amount that is not there yet", () => {
    expect(directSplitProblem({ total: 0, sourceIds: [3, 7], amounts })).toBeNull();
  });
});

describe("writing the portions back", () => {
  it("builds what the API stores", () => {
    const splits = buildDirectSplits({
      userId: "user-1",
      sourceIds: [3, 7],
      amounts: { "3": "600", "7": "400" },
      nameOf: (id) => (id === 3 ? "Salary" : "Business"),
    });
    expect(splits).toEqual([
      { userId: "user-1", label: "Salary", amount: 600, incomeSourceId: 3, fromBank: false },
      { userId: "user-1", label: "Business", amount: 400, incomeSourceId: 7, fromBank: false },
    ]);
  });

  it("falls back to a readable label when the source has gone", () => {
    const [split] = buildDirectSplits({
      userId: null,
      sourceIds: [3],
      amounts: { "3": "600" },
      nameOf: () => undefined,
    });
    expect(split.label).toBe("Personal funds");
  });

  it("round-trips what it read", () => {
    const stored = [
      { userId: "user-1", label: "Salary", amount: 600, incomeSourceId: 3, fromBank: false },
      { userId: "user-1", label: "Business", amount: 400, incomeSourceId: 7, fromBank: false },
    ];
    const { sourceIds, amounts } = directSplitsFrom(stored);
    expect(directSplitsTotal(sourceIds, amounts)).toBe(1000);
    expect(buildDirectSplits({ userId: "user-1", sourceIds, amounts, nameOf: (id) => (id === 3 ? "Salary" : "Business") })).toEqual(stored);
  });
});
