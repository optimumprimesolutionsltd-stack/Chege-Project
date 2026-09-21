import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const page = readFileSync(fileURLToPath(new URL("./pass-through.tsx", import.meta.url)), "utf8");
const app = readFileSync(fileURLToPath(new URL("../App.tsx", import.meta.url)), "utf8");
const layout = readFileSync(fileURLToPath(new URL("../components/layout.tsx", import.meta.url)), "utf8");

// Kamau owes you; you owe Mwangi. Kamau's money lands in your account and
// leaves again the same day, and none of it was ever yours.
describe("one party paying another, on the laptop", () => {
  it("has a page and a way to reach it", () => {
    expect(app).toContain('<Route path="/pass-through" component={PassThrough} />');
    expect(layout).toContain("{ href: '/pass-through', label: 'Paid through you'");
  });

  it("asks who paid and who was paid", () => {
    expect(page).toContain('data-testid="select-payer"');
    expect(page).toContain('data-testid="select-payee"');
  });

  it("shows which way each balance stands while choosing", () => {
    expect(page).toContain("owes you {formatKes(party.owedToUs ?? 0)}");
    expect(page).toContain("you owe {formatKes(party.owedByUs ?? 0)}");
  });

  it("refuses one person on both sides", () => {
    expect(page).toContain("if (payer.id === payee.id) {");
  });

  it("says what will happen before it happens", () => {
    expect(page).toContain('data-testid="pass-through-preview"');
    expect(page).toContain("Your balance ends where it started.");
  });
});

describe("it writes two ordinary postings", () => {
  it("records the money in as a repayment, not income", () => {
    expect(page).toContain("settlesContributorId: payer.id,");
  });

  it("records the money out as not spending", () => {
    expect(page).toContain("isLending: true,");
  });

  it("saves the money in first, in the order it happened", () => {
    expect(page.indexOf("await createDeposit.mutateAsync(")).toBeLessThan(page.indexOf("await createDisbursement.mutateAsync("));
  });

  it("leaves nothing behind saying they arrived together", () => {
    expect(page).not.toContain("passThroughId");
    expect(page).not.toContain("batchId");
  });
});

describe("both balances are offered together", () => {
  it("asks once rather than twice", () => {
    expect(page).toContain("Update both balances?");
    expect(page).toContain("Both postings are saved either way.");
  });

  it("takes the amount off each side, never below zero", () => {
    expect(page).toContain("const payerLeft = Math.max(0, toMoney(owedToUs - total));");
    expect(page).toContain("const payeeLeft = Math.max(0, toMoney(owedByUs - total));");
  });

  it("is offered, never applied", () => {
    expect(page).toContain("if (window.confirm(question)) {");
  });
});
