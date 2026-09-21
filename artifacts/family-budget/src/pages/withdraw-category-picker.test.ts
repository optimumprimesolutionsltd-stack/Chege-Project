import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const bank = readFileSync(fileURLToPath(new URL("./bank.tsx", import.meta.url)), "utf8");

// The same two faults as the phone: a category added here always landed at the
// top level at priority 1, and the picker offered headings the server refuses.
describe("adding a category while withdrawing", () => {
  it("asks which group it joins", () => {
    expect(bank).toContain('data-testid="button-new-category-parent-top-level"');
    expect(bank).toContain('data-testid={`button-new-category-parent-${group.name}`}');
    expect(bank).toContain("...(parent ? { parentId: parent.id } : {}),");
  });

  it("takes the group's tier rather than inventing one", () => {
    expect(bank).toContain("priority: parent?.priority ?? 3,");
    expect(bank).not.toContain("priority: 1,");
  });

  it("clears the choice once the category is made", () => {
    expect(bank).toContain("setNewCategoryParentId(null);");
  });
});

describe("the withdraw category picker", () => {
  it("groups subcategories under their heading", () => {
    expect(bank).toContain("<optgroup key={group.name} label={group.name}>");
  });

  it("no longer offers every category flat", () => {
    expect(bank).not.toContain("{categories?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}");
  });
});
