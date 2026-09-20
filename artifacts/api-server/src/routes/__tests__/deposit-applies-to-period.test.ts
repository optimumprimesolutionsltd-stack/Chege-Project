import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bank = readFileSync("src/routes/joint-account.ts", "utf8");
const contributors = readFileSync("src/routes/contributors.ts", "utf8");
const migration = readFileSync("../../lib/db/migrations/0035_deposit_applies_to_period.sql", "utf8");
const journal = readFileSync("../../lib/db/migrations/meta/_journal.json", "utf8");
const schema = readFileSync("../../lib/db/src/schema/budget.ts", "utf8");

// A hand-recorded contribution has always carried its own month and year,
// separate from created_at, so April's dues can be entered in September. A bank
// deposit had only its real date, so the same payment made through the bank
// counted as September: April stayed in arrears, September showed a surplus,
// and the two could never be reconciled.
describe("a deposit can name the period it covers", () => {
  it("adds the columns without touching the date", () => {
    expect(schema).toContain('appliesToMonth: integer("applies_to_month")');
    expect(schema).toContain('appliesToYear: integer("applies_to_year")');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "applies_to_month" integer');
  });

  it("insists on both or neither, in the database and in the route", () => {
    // A month without a year names no period at all.
    expect(migration).toContain('("applies_to_month" IS NULL) = ("applies_to_year" IS NULL)');
    expect(bank).toContain("if ((appliesToMonth === null) !== (appliesToYear === null)) {");
  });

  it("backfills nothing", () => {
    // Stamping the arrival month onto old rows would turn an absent answer
    // into an asserted one, and they read identically either way.
    expect(migration).not.toContain("UPDATE");
  });

  it("is registered after the migration before it", () => {
    const entries = JSON.parse(journal).entries as Array<{ tag: string; when: number }>;
    const mine = entries.find((entry) => entry.tag === "0035_deposit_applies_to_period");
    const previous = entries.find((entry) => entry.tag === "0034_drop_unused_alias_categories");
    expect(mine!.when).toBeGreaterThan(previous!.when);
  });
});

describe("obligations follow the period, money follows the date", () => {
  it("stores the period beside the date rather than instead of it", () => {
    // The date has to match the bank statement line for line; a date somebody
    // can move to tidy a report reconciles nothing.
    expect(bank).toContain('type: "deposit", amount, description, date,');
    expect(bank).toContain("appliesToMonth,");
    expect(bank).toContain("appliesToYear,");
  });

  it("buckets the contribution grid by the period it covers", () => {
    expect(contributors).toContain("COALESCE(${jointAccountTxTable.appliesToMonth}, EXTRACT(MONTH FROM ${jointAccountTxTable.date}))");
  });

  it("filters the window by the same expression it buckets on", () => {
    // Filtering on the date would fetch a September deposit belonging to April
    // and then bucket it outside the window, and would miss an older one that
    // belongs inside it.
    // Asserted without spelling out a line break: this file is CRLF on disk,
    // so "\n" in an assertion matches nothing once checked out. That has
    // caught me repeatedly today.
    const window = contributors.slice(contributors.indexOf("loadContributionGrid"));
    expect(window).toContain("AND make_date(");
    expect(window).toContain("COALESCE(${jointAccountTxTable.appliesToYear}, EXTRACT(YEAR FROM ${jointAccountTxTable.date}))::int,");
    expect(window).toContain("COALESCE(${jointAccountTxTable.appliesToMonth}, EXTRACT(MONTH FROM ${jointAccountTxTable.date}))::int,");
  });

  it("keeps the comment out of the SQL it explains", () => {
    // A `//` inside a sql template is sent to Postgres as query text.
    const query = contributors.slice(
      contributors.indexOf("AND make_date("),
      contributors.indexOf("make_date(${earliest.year}"),
    );
    expect(query).not.toContain("//");
  });
});

const bankScreen = readFileSync("../mobile-budget/app/(tabs)/bank.tsx", "utf8");

// The person recording the deposit is the one who knows it was April's dues.
describe("the phone offers the second date", () => {
  it("asks only on a deposit", () => {
    expect(bankScreen).toContain("{txType === 'deposit' ? (");
    expect(bankScreen).toContain('testID="bank-applies-to"');
  });

  it("offers months, not days", () => {
    // A contribution period is monthly; a calendar would invite "12 April" and
    // then ignore the 12.
    expect(bankScreen).toContain("MONTH_NAMES[appliesTo.month - 1]");
    expect(bankScreen).not.toContain('testID="bank-applies-to-picker" mode="date"');
  });

  it("defaults to the month it arrived, and says so", () => {
    expect(bankScreen).toContain("'For the month it arrived'");
    expect(bankScreen).toContain('testID="bank-applies-to-arrival"');
  });

  it("allows a prepayment as readily as a late payment", () => {
    // Paying June's dues in April is the same mechanism pointed forward.
    expect(bankScreen).toContain("for (let offset = 3; offset >= -11; offset -= 1) {");
  });

  it("sends it on every way a deposit can be recorded", () => {
    // Split across depositors, joint, single, and an edit — four paths, and a
    // period that only reached some of them would be worse than none.
    expect((bankScreen.match(/appliesToMonth: appliesTo\.month/g) ?? []).length).toBe(4);
  });

  it("reads it back when an existing deposit is opened", () => {
    expect(bankScreen).toContain("setAppliesTo(tx.appliesToMonth && tx.appliesToYear");
  });
});
