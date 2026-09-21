import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const page = readFileSync(fileURLToPath(new URL("./statement.tsx", import.meta.url)), "utf8");
const app = readFileSync(fileURLToPath(new URL("../App.tsx", import.meta.url)), "utf8");
const layout = readFileSync(fileURLToPath(new URL("../components/layout.tsx", import.meta.url)), "utf8");

// The same document the phone produces, on the screen somebody is more likely
// to be holding a bank statement beside.
describe("the account statement, on the laptop", () => {
  it("has a page and a way to reach it", () => {
    expect(app).toContain('<Route path="/statement" component={Statement} />');
    expect(layout).toContain("{ href: '/statement', label: 'Statement'");
  });

  it("asks for an account and a period", () => {
    expect(page).toContain('data-testid="select-statement-account"');
    expect(page).toContain('data-testid="input-statement-from"');
    expect(page).toContain('data-testid="input-statement-to"');
  });

  it("does not ask the server for an impossible period", () => {
    expect(page).toContain("enabled: activeAccountId !== null && !rangeIsBackwards,");
    expect(page).toContain('data-testid="statement-bad-range"');
  });

  it("reads downwards from an opening balance to a closing one", () => {
    // A running balance means nothing in any other order.
    expect(page).toContain("Opening balance");
    expect(page).toContain("Closing balance");
    expect(page).toContain('data-testid="statement-table"');
  });

  it("has a column for each of in, out and balance", () => {
    expect(page).toContain(">In<");
    expect(page).toContain(">Out<");
    expect(page).toContain(">Balance<");
  });

  it("names what moved without being earned or spent", () => {
    expect(page).toContain('data-testid="statement-movement"');
    expect(page).toContain("OF WHICH, NEITHER EARNED NOR SPENT");
  });

  it("opens the PDF the server already builds", () => {
    expect(page).toContain("/api/joint-account/statement.pdf?accountId=");
    expect(page).toContain('data-testid="button-statement-pdf"');
  });

  it("says something when the period is empty", () => {
    expect(page).toContain('data-testid="statement-empty"');
  });
});
