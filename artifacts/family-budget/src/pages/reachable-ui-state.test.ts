import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * UI that can be opened as well as closed.
 *
 * Sync commits ("Published your App") do not usually delete a feature. They
 * delete the one line that reaches it, and everything else stays: the form,
 * its fields, its Save, its Cancel, its tests. Typecheck passes, the suite
 * passes, and the feature is simply unreachable.
 *
 * That is what happened to the create-category form. `75a5520` removed
 * `setIsCreatingCategory(true)`, so the form kept a Save and a Cancel and had
 * nothing that opened it — on the phone (fixed in #212) and here.
 *
 * The signature generalises: a boolean useState whose setter is only ever
 * called with one literal can never round-trip, so whatever it gates is either
 * permanently shut or permanently open. Most one-way flags are deliberate
 * latches, so the check below names the ones that must round-trip rather than
 * failing on every flag it finds.
 */
const source = readFileSync(new URL("./expenses.tsx", import.meta.url), "utf8");

/** Flags that gate something a person has to be able to open AND close. */
const MUST_ROUND_TRIP = ["setIsCreatingCategory"];

describe("state that gates a form can be moved both ways", () => {
  it.each(MUST_ROUND_TRIP)("%s is called with both true and false", (setter) => {
    const opens = source.match(new RegExp(`${setter}\\(\\s*true\\s*\\)`, "g")) ?? [];
    const closes = source.match(new RegExp(`${setter}\\(\\s*false\\s*\\)`, "g")) ?? [];
    // Closing without opening is the exact shape of the bug: the form's Cancel
    // survived the sync commit and its opener did not.
    expect(opens.length, `${setter} never opens anything`).toBeGreaterThan(0);
    expect(closes.length, `${setter} never closes anything`).toBeGreaterThan(0);
  });

  it("the create-category form has a control that opens it", () => {
    expect(source).toContain('data-testid="open-create-category"');
    expect(source).toContain("onClick={() => setIsCreatingCategory(true)}");
  });

  it("offers it only to somebody allowed to create categories", () => {
    expect(source).toContain("{canManageCategories && !isCreatingCategory && (");
  });

  it("hides the opener once the form is open", () => {
    // Otherwise the button sits above a form it has already opened, and
    // pressing it again does nothing visible.
    expect(source).toContain("!isCreatingCategory && (");
  });
});

describe("the form it opens is still whole", () => {
  it.each([
    ["the name field", "New category name"],
    ["the add-to-budget switch", "Add this category to the budget?"],
    ["the save action", "handleQuickCreateCategory(form)"],
  ])("still has %s", (_label, marker) => {
    // The opener is worth nothing if the rest was removed too. None of this
    // was touched by the fix; it is checked because the bug was that working
    // code had quietly become unreachable.
    expect(source).toContain(marker);
  });
});
