import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { absorbedByOpening, openingNote } from "../savings-accounts";

const lib = readFileSync("src/lib/possible-duplicates.ts", "utf8").replace(/\r\n/g, "\n");
const routes = readFileSync("src/routes/possible-duplicates.ts", "utf8");
const imports = readFileSync("src/routes/mpesa-import.ts", "utf8");
const transfers = readFileSync("src/routes/joint-account.ts", "utf8");
const boot = readFileSync("src/index.ts", "utf8");

// One payment typed by hand and brought in from M-Pesa (5 Oct 2026).
describe("the same payment", () => {
  it("is the same budget, direction and amount, within a day, and the same account when both name one", () => {
    expect(lib).toContain("ON i.group_id = t.group_id AND i.type = t.type AND i.amount = t.amount");
    expect(lib).toContain("AND abs(i.date - t.date) <= 1");
    expect(lib).toContain("(t.account_id IS NULL OR i.account_id IS NULL OR t.account_id = i.account_id)");
  });

  it("typed by hand never counts a charge, a savings move, a transfer or an expense's own ledger row", () => {
    expect(lib).toContain("WHERE mpesa_receipt IS NULL AND charge_for_transaction_id IS NULL AND savings_goal_id IS NULL\n    AND expense_id IS NULL AND bank_transfer_id IS NULL");
  });

  it("a pair called different payments is never shown again, and only a manager can say so", () => {
    expect(lib).toContain("WHERE d.typed_kind = t.kind AND d.typed_id = t.id AND d.imported_id = i.id");
    expect(routes).toContain("if (!requireGroupManager(req, res)) return;");
  });

  it("nothing is removed on the server: the person settles each pair", () => {
    expect(lib).not.toMatch(/DELETE FROM (expenses|joint_account_transactions)/);
  });

  it("its side table is made at start-up, never at the cost of booting", () => {
    expect(boot).toContain("void ensurePossibleDuplicates();");
    expect(lib).toContain('CREATE TABLE IF NOT EXISTS "possible_duplicate_dismissals"');
  });
});

describe("a payment or move typed by hand", () => {
  it("is checked against every M-Pesa entry but charges - savings moves and transfers included", () => {
    expect(lib).toContain("WHERE mpesa_receipt IS NOT NULL AND charge_for_transaction_id IS NULL`;");
    expect(lib).toContain('const pool = against === "typed" ? TYPED : IMPORTED_ANY;');
  });

  it("into or out of savings, only against M-Pesa moves for that same goal", () => {
    expect(lib).toContain("AND (c.goal_id IS NULL OR p.savings_goal_id = c.goal_id)");
    expect(routes).toContain("goalId: z.number().int().positive().nullable().optional(),");
  });
});

describe("a code already in another of the person's budgets", () => {
  it("is reported with the budget's name, from its own route: the import route never reads who is asking", () => {
    expect(lib).toContain("JOIN group_memberships m ON m.group_id = t.group_id AND m.user_id = ${userId}");
    expect(routes).toContain('router.post("/possible-duplicates/elsewhere"');
    expect(imports).not.toContain("receiptsElsewhere");
  });
});

// An older statement read after a newer one: its deposits were part of the
// "already there" correction, and must not be counted on top of it.
describe("a savings account's opening correction", () => {
  it("absorbs deposits dated up to the first withdrawal that needed it", () => {
    expect(absorbedByOpening(2000, 5000, "2026-01-10", "2026-03-01")).toBe(2000);
    expect(absorbedByOpening(8000, 5000, "2026-03-01", "2026-03-01")).toBe(5000);
    expect(absorbedByOpening(2000, 5000, "2026-04-01", "2026-03-01")).toBe(0);
    expect(absorbedByOpening(2000, 5000, "2026-01-10", null)).toBe(0);
    expect(absorbedByOpening(2000, 0, "2026-01-10", "2026-03-01")).toBe(0);
  });

  it("is found by its note, and the balance goes up only by what it does not absorb", () => {
    expect(openingNote("M-Shwari")).toBe("Already in M-Shwari before Jamvi's records began");
    expect(transfers).toContain("const nextAmount = goal.currentAmount + opening + delta - absorbed;");
  });
});
