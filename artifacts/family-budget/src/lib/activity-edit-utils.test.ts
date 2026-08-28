import { describe, expect, it } from "vitest";
import { getActivityEditLink, getActivityRecordTarget } from "./activity-edit-utils";

describe("getActivityEditLink", () => {
  it("opens an eligible expense in the existing month-aware expense editor", () => {
    expect(getActivityEditLink({
      id: "expense-24",
      date: "2026-08-22",
      editTarget: "expense",
    })).toEqual({
      href: "/expenses?edit=24&month=8&year=2026",
      label: "Edit expense",
    });
  });

  it("opens an eligible standalone deposit in Joint Bank", () => {
    expect(getActivityEditLink({
      id: "contribution-18",
      date: "2026-08-22",
      editTarget: "deposit",
    })).toEqual({
      href: "/bank?edit=18",
      label: "Edit deposit",
    });
  });

  it("opens monthly contribution rows in the ledger that owns their source record", () => {
    expect(getActivityEditLink({
      id: "expense-funding-24-7",
      date: "2026-08-22",
      editTarget: "expense",
    })).toEqual({
      href: "/expenses?edit=24&month=8&year=2026",
      label: "Edit expense",
    });
    expect(getActivityRecordTarget({
      id: "deposit-contributor-18-2",
      date: "2026-08-22",
      editTarget: "deposit",
    })).toEqual({
      id: 18,
      target: "deposit",
      editLabel: "Edit deposit",
      removeLabel: "Remove deposit",
    });
  });

  it("keeps derived, split, savings, and unflagged rows read-only", () => {
    expect(getActivityEditLink({
      id: "deposit-contributor-18-2",
      date: "2026-08-22",
    })).toBeNull();
    expect(getActivityEditLink({
      id: "savings-18",
      date: "2026-08-22",
      editTarget: "deposit",
    })).toBeNull();
    expect(getActivityEditLink({
      id: "contribution-18",
      date: "2026-08-22",
    })).toBeNull();
  });
});