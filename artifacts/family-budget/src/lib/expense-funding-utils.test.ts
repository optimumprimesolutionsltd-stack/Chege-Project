import { describe, expect, it } from "vitest";
import { hasMissingPersonalFundingSource } from "./expense-funding-utils";

describe("hasMissingPersonalFundingSource", () => {
  it("requires a saved source for a single personal payer", () => {
    expect(hasMissingPersonalFundingSource({
      payerIds: ["member-1"],
      isSplitPayment: false,
      incomeSourceId: null,
      payerIncomeSourceIds: {},
    })).toBe(true);

    expect(hasMissingPersonalFundingSource({
      payerIds: ["member-1"],
      isSplitPayment: false,
      incomeSourceId: 12,
      payerIncomeSourceIds: {},
    })).toBe(false);
  });

  it("requires a distinct saved source for every personal split payer", () => {
    expect(hasMissingPersonalFundingSource({
      payerIds: ["member-1", "member-2"],
      isSplitPayment: true,
      incomeSourceId: null,
      payerIncomeSourceIds: { "member-1": 12, "member-2": null },
    })).toBe(true);

    expect(hasMissingPersonalFundingSource({
      payerIds: ["member-1", "member-2"],
      isSplitPayment: true,
      incomeSourceId: null,
      payerIncomeSourceIds: { "member-1": 12, "member-2": 14 },
    })).toBe(false);
  });
});