import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Editing an expense funded from more than one income source.
 *
 * Creating these already worked here. Editing them did not: the expense opened
 * with "Financed by" disabled and a note promising the portions would be
 * preserved. Preserving beats corrupting, but a shared-group treasurer who
 * split funding on the phone could then fix the description and not the money.
 *
 * The arithmetic is tested by running it, in lib/expense-funding-splits.test.ts.
 * What is checked here is the wiring, because the bug was never in the rules -
 * it was that the page never offered them.
 */
const source = readFileSync(new URL("./expenses.tsx", import.meta.url), "utf8");

describe("the funding controls unfreeze when the portions can be shown", () => {
  it("no longer disables Financed by for every split expense", () => {
    expect(source).toContain('disabled={mode === "edit" && editHasMultipleFundingSplits && !canEditDirectSplits}');
  });

  it("offers editing only when every stored portion names a saved source", () => {
    // A portion from before income sources were saved objects has nothing to
    // select that would represent it, so those stay on the preserve path.
    expect(source).toContain('const canEditDirectSplits = mode === "edit" && editSplitsEditable && !form.paidFromBank;');
    expect(source).toContain("setEditSplitsEditable(storedDirect.editable);");
  });

  it("keeps the preserve-and-explain path for those", () => {
    expect(source).toContain('mode === "edit" && editHasMultipleFundingSplits && !canEditDirectSplits');
    expect(source).toContain("predate saved income sources");
  });
});

describe("the portions editor is shared, not duplicated", () => {
  it("points one set of controls at whichever form is open", () => {
    // Two copies of this block would be two things to keep in step.
    expect(source).toContain('const directSourceIds = mode === "add" ? addDirectSourceIds : editDirectSourceIds;');
    expect(source).toContain('const directSourceAmounts = mode === "add" ? addDirectSourceAmounts : editDirectSourceAmounts;');
    expect(source).toContain("{showDirectPortions && (");
  });

  it("still identifies the rows for tests and screen readers", () => {
    expect(source).toContain('data-testid="expense-direct-funding-portions"');
  });
});

describe("what gets written back", () => {
  it("rewrites the portions only when the funding was touched", () => {
    // Opening an expense to fix a typo must not disturb the money.
    expect(source).toContain("const editingSplits = editSplitsEditable && !editForm.paidFromBank && editFundingDirty;");
    expect(source).toContain("setEditFundingDirty(false);");
  });

  it("validates the portions before replacing what is stored", () => {
    expect(source).toContain("const problem = directSplitProblem({");
    expect(source).toContain("describeDirectSplitProblem(problem)");
  });

  it("builds the replacement through the tested helper", () => {
    expect(source).toContain("buildDirectSplits({");
  });

  it("stops sending a single incomeSourceId once portions are in play", () => {
    // Sending both would leave the API two different answers to the same
    // question about where the money came from.
    expect(source).toContain("!editHasMultipleFundingSplits && !editingSplits && editForm.incomeSourceId");
  });
});
