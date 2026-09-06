/**
 * Which parts of Jamvi a budget uses.
 *
 * The rules that matter are the safe ones: a budget that has never chosen sees
 * everything, and no combination of stored rubbish can produce a budget with
 * nothing in it. Getting either wrong empties somebody's navigation.
 */

import { describe, expect, it } from "vitest";
import {
  ALL_BUDGET_SECTIONS,
  BUDGET_SECTION,
  defaultSectionsForKind,
  isSectionEnabled,
  resolveEnabledSections,
} from "@workspace/db";

describe("resolveEnabledSections", () => {
  it("gives everything to a budget that has never chosen", () => {
    // Every budget that existed before this feature has null here, so this is
    // the case that decides whether the migration changed anybody's app.
    expect(resolveEnabledSections(null)).toEqual(ALL_BUDGET_SECTIONS);
    expect(resolveEnabledSections(undefined)).toEqual(ALL_BUDGET_SECTIONS);
  });

  it("honours a chosen list", () => {
    expect(resolveEnabledSections(["contributions"])).toEqual(["contributions"]);
  });

  it("gives everything rather than nothing for an empty list", () => {
    // A budget with no sections is a budget nobody can use, and that is never
    // what somebody meant by saving an empty selection.
    expect(resolveEnabledSections([])).toEqual(ALL_BUDGET_SECTIONS);
  });

  it("ignores sections it does not recognise", () => {
    // A section removed in a later version must not linger in the nav, and a
    // typo written straight to the database must not break the app.
    expect(resolveEnabledSections(["contributions", "cryptocurrency"])).toEqual(["contributions"]);
  });

  it("falls back to everything when only rubbish is stored", () => {
    expect(resolveEnabledSections(["nonsense"])).toEqual(ALL_BUDGET_SECTIONS);
    expect(resolveEnabledSections("contributions")).toEqual(ALL_BUDGET_SECTIONS);
    expect(resolveEnabledSections({ contributions: true })).toEqual(ALL_BUDGET_SECTIONS);
  });
});

describe("defaultSectionsForKind", () => {
  it("gives a chama what a chama does", () => {
    const chama = defaultSectionsForKind("chama");

    expect(chama).toContain(BUDGET_SECTION.CONTRIBUTIONS);
    // A chama collects and reports. It does not keep a household budget, and
    // showing it one is how the app starts feeling like work.
    expect(chama).not.toContain(BUDGET_SECTION.BUDGET);
    expect(chama).not.toContain(BUDGET_SECTION.GOALS);
  });

  it("gives a family everything", () => {
    expect(defaultSectionsForKind("family")).toEqual(ALL_BUDGET_SECTIONS);
    expect(defaultSectionsForKind("personal")).toEqual(ALL_BUDGET_SECTIONS);
  });

  it("gives everything for a kind it does not know", () => {
    expect(defaultSectionsForKind("something-new")).toEqual(ALL_BUDGET_SECTIONS);
    expect(defaultSectionsForKind(null)).toEqual(ALL_BUDGET_SECTIONS);
  });

  it("never proposes an empty budget", () => {
    for (const kind of ["personal", "family", "chama", "club", "team", "student_group", "other"]) {
      expect(defaultSectionsForKind(kind).length).toBeGreaterThan(0);
    }
  });
});

describe("isSectionEnabled", () => {
  it("answers for a budget that has chosen, and one that has not", () => {
    expect(isSectionEnabled(["contributions"], BUDGET_SECTION.CONTRIBUTIONS)).toBe(true);
    expect(isSectionEnabled(["contributions"], BUDGET_SECTION.EXPENSES)).toBe(false);
    expect(isSectionEnabled(null, BUDGET_SECTION.EXPENSES)).toBe(true);
  });
});
