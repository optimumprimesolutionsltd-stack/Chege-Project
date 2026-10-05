import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_LOCKED_MESSAGE,
  CHARGES_HEADING,
  FULIZA_CHARGES,
  LEDGERS,
  MPESA_CHARGES,
  MPESA_HEADING,
  isBuiltInCategoryName,
} from "../built-in-categories";

const lib = readFileSync("src/lib/built-in-categories.ts", "utf8");
const routes = readFileSync("src/routes/budget-categories.ts", "utf8");

// Fees were filed wherever a picker was pointed each time, so they could not
// be followed and a statement import stopped to ask. Now every budget has one
// place for each - and since 5 Oct 2026 for airtime, bundles and Home Fibre too,
// all under one M-Pesa heading.
describe("the built-in M-Pesa categories", () => {
  it("are an M-Pesa heading holding a ledger for each charge and product", () => {
    expect(MPESA_HEADING).toBe("M-Pesa");
    expect([MPESA_CHARGES, FULIZA_CHARGES]).toEqual(["M-Pesa charges", "Fuliza charges"]);
    expect(LEDGERS).toEqual(["M-Pesa charges", "Fuliza charges", "Airtime", "Data bundles", "Home Fibre"]);
  });

  it("are recognised whatever the spacing or capitals", () => {
    expect(isBuiltInCategoryName("  m-pesa ")).toBe(true);
    expect(isBuiltInCategoryName("m-pesa charges")).toBe(true);
    expect(isBuiltInCategoryName("Fuliza charges")).toBe(true);
    expect(isBuiltInCategoryName("data BUNDLES")).toBe(true);
    expect(isBuiltInCategoryName("Home Fibre")).toBe(true);
    expect(isBuiltInCategoryName("charges")).toBe(false);
    expect(isBuiltInCategoryName("Bank charges")).toBe(false);
    expect(isBuiltInCategoryName("Rent")).toBe(false);
    expect(isBuiltInCategoryName(null)).toBe(false);
  });

  it("are created with a budget of 0, tracked rather than judged", () => {
    expect(lib).toContain("values({ groupId, name: MPESA_HEADING, budgetAmount: 0 })");
    expect(lib).toContain("values({ groupId, name, budgetAmount: 0, parentId: top.id })");
  });

  it("settle a race on the unique name index rather than failing", () => {
    expect((lib.match(/\.onConflictDoNothing\(\)/g) ?? []).length).toBe(2);
  });

  it("rename the old Transaction charges heading to M-Pesa, keeping what is under it", () => {
    expect(CHARGES_HEADING).toBe("Transaction charges");
    expect(lib).toContain("if (former && former.hasChildren) {");
    expect(lib).toContain("await renameWithHistory(groupId, former, MPESA_HEADING);");
  });

  it("adopt one already there, moving it under the heading only from the top level", () => {
    expect(lib).toContain("} else if (existing.parentId === null && existing.id !== top.id && !existing.hasChildren) {");
  });

  it("bring an archived one back", () => {
    expect(lib).toContain(".set({ isArchived: false })");
  });

  it("are made sure of whenever a budget's categories are listed, without ever costing the list", () => {
    expect(routes).toContain("await ensureChargeCategories(groupId).catch(() => {});");
  });
});

// The category already holding M-Pesa's fees becomes M-Pesa charges, rather
// than a new one splitting the same fees in two. "Transaction charges" comes
// first: a budget where it was renamed by hand has fees filed there, and a
// heading cannot hold entries.
describe("the category already holding the fees becomes M-Pesa charges", () => {
  it("is renamed only when there is no M-Pesa charges yet", () => {
    expect(lib).toContain("if (!find(MPESA_CHARGES)) {");
    expect(lib).toContain('const FORMER_NAMES = ["Transaction charges", "Bank charges"];');
  });

  it("takes every expense, split portion and bank entry filed under the old name with it", () => {
    const rename = lib.slice(lib.indexOf("async function renameWithHistory"), lib.indexOf("export async function ensureChargeCategories"));
    expect(rename).toContain("await db.transaction(async (tx) => {");
    expect(rename).toContain("tx.update(expensesTable)");
    expect(rename).toContain("tx.update(expenseCategoryAllocationsTable)");
    expect(rename).toContain("tx.update(jointAccountTxTable)");
  });

  it("leaves one with sub-categories of its own alone", () => {
    expect(lib).toContain("const former = FORMER_NAMES.map(find).find((row) => row && !row.hasChildren);");
  });
});

describe("they cannot be renamed, moved or deleted", () => {
  it("refuses a rename or a move, but takes a budget like any other", () => {
    const put = routes.slice(routes.indexOf('router.put("/budget-categories/:id"'));
    expect(put).toContain("if (isBuiltInCategoryName(existing.name) && (");
    expect(put).toContain("parsed.data.parentId !== existing.parentId");
    expect(put).toContain("res.status(400).json({ error: BUILT_IN_LOCKED_MESSAGE });");
  });

  it("refuses a delete", () => {
    const del = routes.slice(routes.indexOf('router.delete("/budget-categories/:id"'));
    expect(del).toContain("if (target && isBuiltInCategoryName(target.name)) {");
  });

  it("says why, and what can still be changed", () => {
    expect(BUILT_IN_LOCKED_MESSAGE).toContain("You can set their budget");
  });
});
