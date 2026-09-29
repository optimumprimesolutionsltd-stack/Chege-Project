import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { notAReversal, reversalLinksReady, setReversalLinksReadyForTests, soleReversalCandidate } from "../reversal-links";

const bank = readFileSync("src/routes/joint-account.ts", "utf8");
const dashboard = readFileSync("src/routes/dashboard.ts", "utf8");
const contributors = readFileSync("src/routes/contributors.ts", "utf8");
const contributions = readFileSync("src/routes/contributions.ts", "utf8");
const index = readFileSync("src/index.ts", "utf8");
const migration = readFileSync("../../lib/db/migrations/0047_reversal_links.sql", "utf8");
const journal = JSON.parse(readFileSync("../../lib/db/migrations/meta/_journal.json", "utf8")) as { entries: Array<{ tag: string; when: number }> };

afterEach(() => setReversalLinksReadyForTests(false));

// Migrations are run by hand after a deploy, and a query naming a missing
// table fails outright. So nothing changes until the table is known to exist.
describe("before the table exists", () => {
  it("adds nothing to any income figure", () => {
    expect(reversalLinksReady()).toBe(false);
    const fragment = notAReversal(sql`t.id`) as unknown as { queryChunks: unknown[] };
    expect(JSON.stringify(fragment.queryChunks)).not.toContain("reversal_links");
  });

  it("is made by the server itself, after it is listening, and never stops a boot", () => {
    expect(index).toContain("void ensureReversalLinks();");
    expect(index.indexOf("void ensureReversalLinks();")).toBeGreaterThan(index.indexOf("app.listen("));
  });
});

describe("once it exists", () => {
  it("leaves a linked money-back deposit out", () => {
    setReversalLinksReadyForTests(true);
    const fragment = notAReversal(sql`t.id`) as unknown as { queryChunks: unknown[] };
    expect(JSON.stringify(fragment.queryChunks)).toContain("NOT EXISTS (SELECT 1 FROM reversal_links rl WHERE rl.reversal_transaction_id = ");
  });

  it("is left out of every income figure", () => {
    expect((dashboard.match(/\$\{notAReversal\(/g) ?? []).length).toBeGreaterThanOrEqual(11);
    expect((contributors.match(/\$\{notAReversal\(/g) ?? []).length).toBe(3);
    expect((contributions.match(/\$\{notAReversal\(/g) ?? []).length).toBe(1);
  });
});

describe("the migration", () => {
  it("is idempotent, so a server that made the table itself is not broken by migrate", () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "reversal_links"');
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS "reversal_links_group_idx"');
  });

  it("is registered after the one before it, so drizzle does not silently skip it", () => {
    const at = journal.entries.findIndex((entry) => entry.tag === "0047_reversal_links");
    expect(at).toBeGreaterThan(0);
    expect(journal.entries[at].when).toBeGreaterThan(journal.entries[at - 1].when);
  });
});

describe("linking a reversal", () => {
  it("takes only money in that could be money back", () => {
    expect(bank).toContain('if (tx.type !== "deposit") return "Only money coming in can be a reversal.";');
    expect(bank).toContain('return "Borrowed money, or money paid back to you, is not a reversal.";');
  });

  it("takes only an ordinary payment, never a transfer or an expense's bank portion", () => {
    expect(bank).toContain('if (tx.type !== "disbursement") return "Only a payment can be reversed.";');
    expect(bank).toContain('if (tx.expenseId !== null) return "This payment belongs to an expense. Edit or delete the expense instead.";');
  });

  it("insists on exactly the same amount, and money back no earlier than the payment", () => {
    expect(bank).toContain("A reversal gives back exactly what was paid. These amounts differ.");
    expect(bank).toContain("Money cannot come back before it was paid.");
  });

  it("offers candidates from this budget, of the same amount, within 60 days before, not already reversed", () => {
    expect(bank).toContain("const REVERSAL_WINDOW_DAYS = 60;");
    expect(bank).toContain("AND ${jointAccountTxTable.amount} = ${deposit.amount}");
    expect(bank).toContain("AND NOT EXISTS (SELECT 1 FROM reversal_links rl WHERE rl.original_transaction_id = ${jointAccountTxTable.id})");
  });

  it("links and sets the payment's category aside together, keeping it for unlinking", () => {
    const link = bank.slice(bank.indexOf("async function linkReversal"), bank.indexOf("async function loadTx"));
    expect(link).toContain("await db.transaction(async (trx) => {");
    expect(link).toContain("originalCategory: original.expenseCategory,");
    expect(link).toContain(".set({ expenseCategory: null })");
    const post = bank.slice(bank.indexOf('router.post("/joint-account/:id/reversal"'));
    expect(post).toContain("if (!requireGroupManager(req, res)) return;");
  });

  it("puts the category back on unlinking, unless the payment has since been given one", () => {
    const del = bank.slice(bank.indexOf('router.delete("/joint-account/:id/reversal"'));
    expect(del).toContain(".set({ expenseCategory: link.originalCategory })");
    expect(del).toContain("isNull(jointAccountTxTable.expenseCategory),");
  });
});

describe("either half is protected while linked", () => {
  it("refuses an edit", () => {
    const put = bank.slice(bank.indexOf('router.put("/joint-account/:id"'));
    expect(put).toContain("const reversedEdit = await refuseWhileReversed(existing.id, groupId);");
  });

  it("refuses a delete", () => {
    const del = bank.slice(bank.indexOf('router.delete("/joint-account/:id", async'));
    expect(del).toContain("const reversedDelete = await refuseWhileReversed(parsed.data.id, groupId);");
  });

  it("says which half it is and what to do", () => {
    expect(bank).toContain("This money back is linked to the payment it reversed. Unlink it first.");
    expect(bank).toContain("This payment was reversed and is linked to its money back. Unlink it first.");
  });
});

// Linking by hand left every reversal counting as income until somebody
// opened it. Most have exactly one possible payment, and are matched for them.
describe("matching reversals automatically", () => {
  const auto = bank.slice(bank.indexOf('router.post("/joint-account/reversals/auto-link"'));

  it("links only a money-back entry with one possible payment, or one made twice", () => {
    expect(auto).toContain("const sole = soleReversalCandidate(candidates, String(deposit.date));");
    expect(auto).toContain("const refused = await linkReversal(deposit, sole.tx, groupId);");
  });

  it("goes oldest first, so two money-backs cannot claim the same payment", () => {
    expect(auto).toContain("ASC, ${jointAccountTxTable.id} ASC`)");
    expect(bank).toContain("AND NOT EXISTS (SELECT 1 FROM reversal_links rl WHERE rl.original_transaction_id = ${jointAccountTxTable.id})");
  });

  it("lists the rest with how many payments could match, for the person to settle", () => {
    expect(auto).toContain("needsYou.push({");
    expect(auto).toContain("candidates: candidates.length,");
  });

  it("makes every link through the same checks as linking by hand", () => {
    const manual = bank.slice(bank.indexOf('router.post("/joint-account/:id/reversal"'), bank.indexOf('router.post("/joint-account/reversals/auto-link"'));
    expect(manual).toContain("const refused = await linkReversal(deposit, original, groupId);");
    expect((bank.match(/await trx\.insert\(reversalLinksTable\)/g) ?? []).length).toBe(1);
  });

  it("is for owners and admins, and does nothing before the table exists", () => {
    expect(auto).toContain("if (!requireGroupManager(req, res)) return;");
    expect(auto).toContain("res.json({ linked: 0, needsYou: [] });");
  });
});

describe("money back is never income, linked or not", () => {
  it("is left out by what the import files it as, before the table exists too", () => {
    setReversalLinksReadyForTests(false);
    const fragment = JSON.stringify((notAReversal(sql`t.id`) as unknown as { queryChunks: unknown[] }).queryChunks);
    expect(fragment).toContain("mb.description ILIKE");
    expect(fragment).toContain("Money back%");
  });

  it("is left out by its link too, once the table exists", () => {
    setReversalLinksReadyForTests(true);
    const fragment = JSON.stringify((notAReversal(sql`t.id`) as unknown as { queryChunks: unknown[] }).queryChunks);
    expect(fragment).toContain("mb.description ILIKE");
    expect(fragment).toContain("reversal_links rl WHERE rl.reversal_transaction_id");
  });

  it("is filed as its own kind on All income, shown beside income rather than dropped", () => {
    expect(dashboard).toContain("WHEN ${isMoneyBack(sql`t.id`, sql`t.description`)} THEN 'money_back'");
  });
});

// Two identical KCB payments the same day, one of which came back: the payee
// written "806 38 76" once and "8063876" the other time.
describe("the payment a money-back is linked to without asking", () => {
  const payment = (id: number, over: Record<string, unknown> = {}) => ({
    tx: { id, date: "2026-09-10", accountId: 1, expenseCategory: "Stock", description: "Lipa Na Kcb (806 38 76)", ...over },
  });

  it("is the only one, or none", () => {
    expect(soleReversalCandidate([payment(1)])?.tx.id).toBe(1);
    expect(soleReversalCandidate([])).toBeNull();
  });

  it("is either of the same payment made twice that day", () => {
    expect(soleReversalCandidate([payment(2), payment(1, { description: "Lipa Na Kcb (8063876)" })])?.tx.id).toBe(2);
  });

  it("is asked about when the payments differ in payee, day, account or category", () => {
    expect(soleReversalCandidate([payment(2), payment(1, { description: "Naivas" })])).toBeNull();
    expect(soleReversalCandidate([payment(2), payment(1, { date: "2026-09-09" })])).toBeNull();
    expect(soleReversalCandidate([payment(2), payment(1, { accountId: 2 })])).toBeNull();
    expect(soleReversalCandidate([payment(2), payment(1, { expenseCategory: "Rent" })])).toBeNull();
  });
});

// "It doesn't": his KCB payments of the same amount recur, so the 60-day window
// held payments on other days and every reversal looked ambiguous.
describe("a reversal of a payment made the same amount on other days too", () => {
  const payment = (id: number, date: string, description = "Lipa Na Kcb (806 38 76)") => ({
    tx: { id, date, accountId: 1, expenseCategory: "Stock", description },
  });
  const candidates = [
    payment(3, "2026-09-10"),
    payment(2, "2026-09-10", "Lipa Na Kcb (8063876)"),
    payment(1, "2026-08-10"),
  ];

  it("is matched among the payments on its own day", () => {
    expect(soleReversalCandidate(candidates, "2026-09-10")?.tx.id).toBe(3);
  });

  it("is still asked about when nothing that day matches and the rest differ", () => {
    expect(soleReversalCandidate(candidates, "2026-09-12")).toBeNull();
  });

  it("is asked about when the payments that day differ", () => {
    expect(soleReversalCandidate([payment(3, "2026-09-10"), payment(2, "2026-09-10", "Naivas")], "2026-09-10")).toBeNull();
  });
});

describe("auto-link", () => {
  it("passes the money back's own day", () => {
    expect(readFileSync("src/routes/joint-account.ts", "utf8")).toContain("const sole = soleReversalCandidate(candidates, String(deposit.date));");
  });
});
