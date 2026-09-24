import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const page = readFileSync(fileURLToPath(new URL("./bank-day.tsx", import.meta.url)), "utf8");
const app = readFileSync(fileURLToPath(new URL("../App.tsx", import.meta.url)), "utf8");
const layout = readFileSync(fileURLToPath(new URL("../components/layout.tsx", import.meta.url)), "utf8");

// The posting form asks one question at a time, which is right for one thing
// and wrong for eleven. A laptop suits a day better than a phone does: a table
// of rows is what a day actually looks like.
describe("a day of banking, on the laptop", () => {
  it("has a page and a way to reach it", () => {
    expect(app).toContain('<Route path="/bank-day" component={BankDay} />');
    expect(layout).toContain("{ href: '/bank-day', label: 'Enter a whole day'");
  });

  it("holds one date and one account for the whole of it", () => {
    expect(page).toContain('data-testid="input-day-date"');
    expect(page).toContain("const activeAccountId = accountId ?? accounts[0]?.id ?? null;");
  });

  it("takes lines of any kind, because a real day is a mix", () => {
    expect(page).toContain('type RowKind = "spend" | "pay-party" | "money-in" | "repaid" | "borrowed" | "lend";');
  });

  it("lets a line be added and taken away, never leaving none", () => {
    expect(page).toContain('data-testid="button-day-add-row"');
    expect(page).toContain("current.length === 1 ? [blankRow(chargeCategory)]");
  });
});

describe("the balance moves as the day is written", () => {
  it("shows what the day leaves before any of it is saved", () => {
    expect(page).toContain('data-testid="day-projected"');
    expect(page).toContain("const projected = openingBalance + unsavedRows.reduce((total, row) => total + rowEffect(row), 0);");
  });

  it("stops counting a line once it is saved", () => {
    expect(page).toContain("const unsavedRows = rows.filter((row) => !row.saved);");
  });
});

describe("saving leaves no batch behind", () => {
  it("writes ordinary postings, one per line", () => {
    expect(page).toContain("await createDisbursement.mutateAsync({");
    expect(page).toContain("await createDeposit.mutateAsync({");
    expect(page).not.toContain("batchId");
  });

  it("carries the kind of each line onto its posting", () => {
    expect(page).toContain('...(row.kind === "repaid" && party ? { settlesContributorId: party.id } : {}),');
    expect(page).toContain('...(row.kind === "borrowed" ? { isBorrowing: true } : {}),');
  });

  it("refuses a line that is not ready before writing anything", () => {
    expect(page).toContain("const problem = rowProblem(row);");
    expect(page).toContain('title: "One line is not ready"');
  });

  it("keeps what was written when one line fails part way", () => {
    expect(page).toContain("saved.push(row);");
    expect(page).toContain("What saved is saved. The rest is still here.");
  });
});

describe("the balances are offered once, at the end", () => {
  it("asks for the whole day together rather than after every line", () => {
    expect(page).toContain("const offerBalanceChanges = async (saved: DayRow[]) => {");
    expect(page).toContain("The postings are already saved either way.");
  });

  it("still asks rather than applying", () => {
    expect(page).toContain("if (!window.confirm(question)) return;");
  });

  it("never drives a balance below zero", () => {
    // Paying a person, being repaid, and spending against a debt category.
    expect((page.match(/Math\.max\(0, toMoney\(owed - amount\)\)/g) ?? []).length).toBe(3);
  });
});
