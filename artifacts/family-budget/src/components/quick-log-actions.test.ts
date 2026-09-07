/**
 * What the quick log offers, given what a budget actually uses.
 *
 * This menu is the fastest route to recording money, and it used to offer the
 * same four things to every budget. A chama starts with only Contributions,
 * Group account, Reports and Activity switched on, so three of the four opened
 * a tab it had hidden - and recording contributions, the one thing a chama
 * does every month, was not on the menu at all.
 */

import { describe, expect, it } from "vitest";
import { quickLogActions } from "./layout";

const CHAMA = ["contributions", "bank", "reports", "activity"];
const CHURCH = ["contributions", "expenses", "bank", "reports", "activity"];
const EVERYTHING = ["contributions", "expenses", "budget", "activity", "goals", "bank", "reports"];

describe("quickLogActions", () => {
  it("offers a chama contributions, and nothing it has switched off", () => {
    expect(quickLogActions(CHAMA, true)).toEqual(["contribution", "income"]);
  });

  it("puts contributions first, because that is why the menu is opened", () => {
    // A treasurer opens this to record the month. Anything above it is in the
    // way.
    expect(quickLogActions(CHURCH, true)[0]).toBe("contribution");
    expect(quickLogActions(EVERYTHING, true)[0]).toBe("contribution");
  });

  it("never offers contributions on a personal budget", () => {
    // There is nobody to record for. The tab is shared-only in the nav too.
    expect(quickLogActions(EVERYTHING, false)).not.toContain("contribution");
  });

  it("offers everything to a budget that uses everything", () => {
    expect(quickLogActions(EVERYTHING, true)).toEqual([
      "contribution",
      "expense",
      "income",
      "budget",
      "goal",
    ]);
  });

  it("offers everything while the group is still loading", () => {
    // Undefined means "not known yet", not "nothing enabled". Filtering on it
    // would make the menu flicker as the group arrives.
    expect(quickLogActions(undefined, true)).toHaveLength(5);
    expect(quickLogActions(undefined, false)).toHaveLength(4);
  });

  it("hides an action whose tab is off, one section at a time", () => {
    const without = (section: string) => EVERYTHING.filter((entry) => entry !== section);

    expect(quickLogActions(without("expenses"), true)).not.toContain("expense");
    expect(quickLogActions(without("bank"), true)).not.toContain("income");
    expect(quickLogActions(without("budget"), true)).not.toContain("budget");
    expect(quickLogActions(without("goals"), true)).not.toContain("goal");
    expect(quickLogActions(without("contributions"), true)).not.toContain("contribution");
  });

  it("returns nothing rather than a dead menu when a budget uses none of them", () => {
    // A group that only reads reports has nothing to quick-log. Better an
    // empty list the caller can hide than five buttons that go nowhere.
    expect(quickLogActions(["reports", "activity"], true)).toEqual([]);
  });
});
