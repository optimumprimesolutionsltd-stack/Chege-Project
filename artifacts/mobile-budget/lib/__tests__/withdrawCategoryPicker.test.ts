import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mobile = readFileSync("app/(tabs)/bank.tsx", "utf8");

// "CAN'T FIND IT? ADD A CATEGORY" made a top-level category at priority 1,
// every time, with no say in either. That is how a budget acquires a flat list
// of strays beside the groups it was given, each one quietly declared must-pay.
describe("adding a category while withdrawing", () => {
  it("asks which group it joins", () => {
    expect(mobile).toContain('testID="bank-new-category-parent-top-level"');
    expect(mobile).toContain('testID={`bank-new-category-parent-${group.name}`}');
    expect(mobile).toContain("...(parent ? { parentId: parent.id } : {}),");
  });

  it("takes the group's tier rather than inventing one", () => {
    // The ranking says what the group is worth against other groups. Asking
    // again per ledger invites two answers to one question.
    expect(mobile).toContain("priority: parent?.priority ?? 3,");
    expect(mobile).not.toContain("priority: 1,");
  });

  it("starts a new group in the middle, not at must-pay", () => {
    // 1 is a claim, and nothing added in passing has made it.
    expect(mobile).toContain("?? 3,");
  });

  it("clears the choice once the category is made", () => {
    // Otherwise the next one silently joins the same group.
    expect(mobile).toContain("setNewCategoryParentId(null);");
  });
});

// The picker listed every category flat, headings included, and left the
// server to refuse one with a 400 — an error for choosing something the app
// had offered.
describe("the withdraw category picker", () => {
  it("shows subcategories under their heading", () => {
    expect(mobile).toContain("{categoryTree.map((group) => (");
    expect(mobile).toContain("{group.name.toUpperCase()}");
    expect(mobile).toContain('key={`withdraw-child-${child}`}');
  });

  it("no longer offers a heading to post to", () => {
    expect(mobile).not.toContain("{categories.map(c => (");
  });

  it("still offers a top-level category that holds no subcategories", () => {
    // Those can receive spending, and excluding them would lose most budgets.
    expect(mobile).toContain("onPress={() => { setExpenseCategory(group.name); setShowCategoryPicker(false); }}");
  });

  it("reads one tree, not two", () => {
    expect(mobile).toContain("const categoryTree = useMemo(");
    expect(mobile).not.toContain("reconcileTree");
  });
});
