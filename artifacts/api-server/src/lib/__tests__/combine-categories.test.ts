import { beforeEach, describe, expect, it, vi } from "vitest";

// "rent share and rent are one and the same thing. i do not want two
// categories" (13 Oct 2026) - onboarding's Shared bills beside Housing.
type Found = { id: number; name: string; parent_id: number | null; budget_amount: number; children: number; parent_name: string | null };
const state = vi.hoisted(() => ({ statements: [] as string[], params: [] as unknown[][], found: [] as Found[] }));

const text = (query: unknown): string => {
  const chunks = (query as { queryChunks?: unknown[] }).queryChunks ?? [];
  return chunks.map((chunk) => {
    if (chunk && typeof chunk === "object" && "value" in chunk) return (chunk as { value: string[] }).value.join("");
    if (chunk && typeof chunk === "object" && "queryChunks" in chunk) return text(chunk);
    return "?";
  }).join("");
};
const values = (query: unknown): unknown[] => ((query as { queryChunks?: unknown[] }).queryChunks ?? [])
  .filter((chunk) => !(chunk && typeof chunk === "object" && ("value" in chunk || "queryChunks" in chunk)));

vi.mock("@workspace/db", () => ({
  db: {
    transaction: async (run: (trx: unknown) => unknown) => run({
      execute: async (query: unknown) => {
        const statement = text(query);
        state.statements.push(statement);
        state.params.push(values(query));
        if (statement.includes('FROM "budget_categories" c')) return { rows: state.found };
        return { rows: [], rowCount: statement.includes('UPDATE "expenses"') ? 4 : 0 };
      },
    }),
  },
}));
vi.mock("../payee-rules", () => ({ payeeRulesReady: () => true }));
vi.mock("../reversal-links", () => ({ reversalLinksReady: () => true }));

import { combineCategories } from "../combine-categories";

const rentShare: Found = { id: 21, name: "Rent share", parent_id: 20, budget_amount: 0, children: 0, parent_name: "Shared bills" };
const rent: Found = { id: 11, name: "Rent", parent_id: 10, budget_amount: 25000, children: 0, parent_name: "Housing" };

beforeEach(() => {
  state.statements = [];
  state.params = [];
  state.found = [rentShare, rent];
});

describe("combining one category into another", () => {
  it("moves everything filed under it to the one kept, then deletes it and its empty heading", async () => {
    expect(await combineCategories(1, 21, 11)).toEqual({ ok: true, moved: 4, into: "Rent" });
    const all = state.statements.join("\n");
    expect(all).toContain('UPDATE "expenses" SET "category"');
    expect(all).toContain('UPDATE "expense_category_allocations" SET "category"');
    expect(all).toContain('UPDATE "joint_account_transactions" SET "expense_category"');
    expect(all).toContain('UPDATE "reversal_links" SET "original_category"');
    expect(all).toContain("\"key\" NOT LIKE 'src:%'");
    expect(all).toContain('DELETE FROM "budget_categories" WHERE "id"');
    // Shared bills goes once Rent share was the last thing in it.
    expect(state.statements[state.statements.length - 1]).toContain('DELETE FROM "budget_categories" p');
    // Rent kept its own budget: the two budgeted the same money.
    expect(all).not.toContain('SET "budget_amount"');
  });

  it("takes the other's budget only when the one kept had none", async () => {
    state.found = [{ ...rentShare, budget_amount: 18000 }, { ...rent, budget_amount: 0 }];
    await combineCategories(1, 21, 11);
    const index = state.statements.findIndex((statement) => statement.includes('SET "budget_amount"'));
    expect(index).toBeGreaterThan(-1);
    expect(state.params[index]).toContain(18000);
  });

  it("keeps a heading both sat under", async () => {
    state.found = [{ ...rentShare, parent_id: 10, parent_name: "Housing" }, rent];
    await combineCategories(1, 21, 11);
    expect(state.statements.some((statement) => statement.includes('DELETE FROM "budget_categories" p'))).toBe(false);
  });

  it("never a heading, a built-in category, one from another budget, or into itself", async () => {
    state.found = [{ ...rentShare, children: 2 }, rent];
    expect(await combineCategories(1, 21, 11)).toMatchObject({ ok: false, status: 400 });
    state.found = [{ ...rentShare, name: "M-Pesa charges" }, rent];
    expect(await combineCategories(1, 21, 11)).toMatchObject({ ok: false, status: 400 });
    state.found = [rent];
    expect(await combineCategories(1, 21, 11)).toMatchObject({ ok: false, status: 404 });
    expect(await combineCategories(1, 11, 11)).toMatchObject({ ok: false, status: 400 });
    expect(state.statements.some((statement) => statement.includes("DELETE"))).toBe(false);
  });
});
