import { beforeEach, describe, expect, it, vi } from "vitest";

// "dahanak ventures and rental income are one and the same thing. why cant we
// combine them" - "this problem came from onboarding" (11 Oct 2026).
const state = vi.hoisted(() => ({ statements: [] as string[], found: [] as Array<{ id: number; business: boolean }> }));

const text = (query: unknown): string => {
  const chunks = (query as { queryChunks?: unknown[] }).queryChunks ?? [];
  return chunks.map((chunk) => {
    if (chunk && typeof chunk === "object" && "value" in chunk) return (chunk as { value: string[] }).value.join("");
    if (chunk && typeof chunk === "object" && "queryChunks" in chunk) return text(chunk);
    return "?";
  }).join("");
};

vi.mock("@workspace/db", () => ({
  db: {
    transaction: async (run: (trx: unknown) => unknown) => run({
      execute: async (query: unknown) => {
        const statement = text(query);
        state.statements.push(statement);
        if (statement.includes("SELECT s.\"id\"")) return { rows: state.found };
        return { rows: [], rowCount: statement.includes("UPDATE \"joint_account_transactions\"") ? 3 : 0 };
      },
    }),
  },
}));
vi.mock("../business-streams", () => ({ businessStreamsReady: () => true }));
vi.mock("../business-accounts", () => ({ businessAccountsReady: () => true }));
vi.mock("../entries-to-sort", () => ({ entriesToSortReady: () => true }));
vi.mock("../payee-rules", () => ({ payeeRulesReady: () => true }));
vi.mock("../owner-business-money", () => ({ ownerBusinessReady: () => true }));

import { combineIncomeSources } from "../combine-income-sources";

beforeEach(() => {
  state.statements = [];
  state.found = [{ id: 7, business: false }, { id: 3, business: true }];
});

describe("combining an income stream into a business", () => {
  it("moves everything that names the stream to the business, then deletes the stream", async () => {
    expect(await combineIncomeSources(1, 7, 3)).toEqual({ ok: true, moved: 3 });
    const all = state.statements.join("\n");
    for (const table of ["joint_account_transactions", "joint_account_deposit_splits", "expenses", "expense_income_splits", "business_bank_accounts", "owner_business_money", "entries_to_check"]) {
      expect(all).toContain(`UPDATE "${table}" SET "income_source_id"`);
    }
    expect(all).toContain('UPDATE "budget_categories" SET "reduces_income_source_id"');
    expect(all).toContain("\"key\" LIKE 'src:%'");
    expect(state.statements[state.statements.length - 1]).toContain('DELETE FROM "income_sources"');
  });

  it("only into a business, and never a business into another", async () => {
    state.found = [{ id: 7, business: false }, { id: 3, business: false }];
    expect(await combineIncomeSources(1, 7, 3)).toMatchObject({ ok: false, status: 400 });
    state.found = [{ id: 7, business: true }, { id: 3, business: true }];
    expect(await combineIncomeSources(1, 7, 3)).toMatchObject({ ok: false, status: 400 });
    expect(state.statements.some((statement) => statement.includes("DELETE"))).toBe(false);
  });

  it("not a stream from another budget, and not into itself", async () => {
    state.found = [{ id: 3, business: true }];
    expect(await combineIncomeSources(1, 7, 3)).toMatchObject({ ok: false, status: 404 });
    expect(await combineIncomeSources(1, 3, 3)).toMatchObject({ ok: false, status: 400 });
  });
});
