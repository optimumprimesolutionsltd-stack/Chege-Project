import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { alreadyThere, completeAt, isSavingsAccount, roomIn } from "../savings-accounts";

const transfers = readFileSync("src/routes/joint-account.ts", "utf8");
const goals = readFileSync("src/routes/savings-goals.ts", "utf8");

// M-Shwari, KCB M-PESA, Ziidi and Mali are savings accounts in the Savings
// section (5 Oct 2026): a savings goal with no target, so money moves in and
// out of it freely and the M-Pesa line it moves through still reconciles.
describe("a savings account", () => {
  const account = { targetAmount: 0, currentAmount: 1000 };
  const goal = { targetAmount: 5000, currentAmount: 1000 };

  it("is a savings goal with no target", () => {
    expect(isSavingsAccount(account)).toBe(true);
    expect(isSavingsAccount(goal)).toBe(false);
  });

  it("never completes, and takes any amount", () => {
    expect(completeAt(account, 1_000_000)).toBe(false);
    expect(roomIn(account)).toBe(Number.POSITIVE_INFINITY);
    expect(completeAt(goal, 5000)).toBe(true);
    expect(roomIn(goal)).toBe(4000);
  });

  it("held what a withdrawal takes beyond Jamvi's records: the statement started part-way", () => {
    expect(alreadyThere(account, 1500)).toBe(500);
    expect(alreadyThere(account, 800)).toBe(0);
    expect(alreadyThere(goal, 1500)).toBe(0);
  });
});

describe("the routes treat it as one", () => {
  it("a transfer out of it records what was there before as a balance correction, not an error", () => {
    expect(transfers).toContain('const opening = direction === "from_savings" ? alreadyThere(goal, amount) : 0;');
    expect(transfers).toContain("note: openingNote(goal.name),");
    expect(transfers).toContain("const nextAmount = goal.currentAmount + opening + delta - absorbed;");
  });

  it("is never marked complete, nor capped, anywhere a balance changes", () => {
    expect(transfers).not.toContain("isCompleted: nextAmount >= goal.targetAmount");
    expect(goals).not.toContain("isCompleted: nextAmount >= goal.targetAmount");
    expect(goals).toContain("if (isSavingsAccount(goal)) continue;");
  });

  it("is made by asking for a target of 0", () => {
    expect(goals).toContain("targetAmount: z.number().min(0),");
  });
});
