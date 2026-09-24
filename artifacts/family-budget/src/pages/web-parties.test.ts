import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const page = readFileSync(fileURLToPath(new URL("./parties.tsx", import.meta.url)), "utf8");
const app = readFileSync(fileURLToPath(new URL("../App.tsx", import.meta.url)), "utf8");
const layout = readFileSync(fileURLToPath(new URL("../components/layout.tsx", import.meta.url)), "utf8");
const phone = readFileSync(
  fileURLToPath(new URL("../../../mobile-budget/app/parties.tsx", import.meta.url)),
  "utf8",
);

// The phone got this screen in #285. The laptop had nowhere at all to see who
// you owe or who owes you, let alone correct a balance typed wrong — and
// correcting figures is exactly what somebody sits down at a laptop for.
describe("creditors and debtors, on the laptop", () => {
  it("has a page and a way to reach it", () => {
    expect(app).toContain('<Route path="/parties" component={Parties} />');
    expect(layout).toContain("{ href: '/parties', label: 'Who owes who'");
  });

  it("lists both directions, and those with neither", () => {
    expect(page).toContain("You owe them — creditors");
    expect(page).toContain("They owe you — debtors");
    expect(page).toContain("No balance tracked");
  });

  it("adds each direction up without netting them", () => {
    expect(page).toContain('data-testid="parties-totals"');
    expect(page).toContain('data-testid="parties-net"');
  });
});

describe("somebody can be a creditor and a debtor at once", () => {
  it("takes both balances on one person", () => {
    expect(page).toContain('data-testid="input-owed-by-us"');
    expect(page).toContain('data-testid="input-owed-to-us"');
    expect(page).toContain("I owe them");
    expect(page).toContain("They owe me");
  });

  it("shows the other figure on the row when both are set", () => {
    expect(page).toContain('data-testid={`party-both-${party.id}`}');
  });

  it("lists them under both headings rather than picking one", () => {
    expect(page).toContain('const creditors = parties.filter((party) => typeof party.owedByUs === "number");');
    expect(page).toContain('const debtors = parties.filter((party) => typeof party.owedToUs === "number");');
  });
});

describe("an opening balance can be set and corrected", () => {
  it("creates and edits through the same draft", () => {
    expect(page).toContain('editingId === null ? "/api/contributors" : `/api/contributors/${editingId}`');
    expect(page).toContain('method: editingId === null ? "POST" : "PATCH",');
  });

  it("tells blank from zero, as the phone does", () => {
    expect(page).toContain('if (value.trim() === "") return null;');
    expect(page).toContain("Blank is not the same as zero.");
    expect(phone).toContain("Blank is not the same as zero.");
  });

  it("sends both directions every time, so clearing one really clears it", () => {
    expect(page).toContain("const body = JSON.stringify({ name, kind: draftKind, owedByUs, owedToUs });");
  });

  it("takes the cents the column holds, and no negatives", () => {
    expect(page).toContain(String.raw`if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return "invalid";`);
    expect(page).toContain("return toMoney(parsed);");
  });

  it("can say somebody is a bank rather than a person", () => {
    expect(page).toContain('data-testid="button-kind-institution"');
  });

  it("says something useful when nobody is recorded", () => {
    expect(page).toContain('data-testid="parties-empty"');
  });
});
