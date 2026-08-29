import { describe, expect, it } from "vitest";
import { getProjectedBalanceAfterOutgoing } from "../bankBalance";

describe("bank overdraft projection", () => {
  it("warns when a new outgoing amount exceeds the current balance", () => {
    expect(getProjectedBalanceAfterOutgoing(500, 650)).toBe(-150);
  });

  it("does not deduct the old withdrawal twice while editing", () => {
    expect(getProjectedBalanceAfterOutgoing(300, 500, {
      amount: 200,
      type: "disbursement",
    })).toBe(0);
  });
});