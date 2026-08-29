import { describe, expect, it } from "vitest";
import { getProjectedBalanceAfterOutgoing } from "./bank-balance-utils";

describe("bank overdraft projection", () => {
  it("subtracts a new outgoing amount from the current balance", () => {
    expect(getProjectedBalanceAfterOutgoing(500, 650)).toBe(-150);
  });

  it("replaces an existing withdrawal instead of deducting it twice", () => {
    expect(getProjectedBalanceAfterOutgoing(300, 500, {
      amount: 200,
      type: "disbursement",
    })).toBe(0);
  });

  it("removes an existing deposit before changing it to an outgoing transfer", () => {
    expect(getProjectedBalanceAfterOutgoing(700, 250, {
      amount: 200,
      type: "deposit",
    })).toBe(250);
  });
});