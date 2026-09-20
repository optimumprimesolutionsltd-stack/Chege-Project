import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getProjectedBalanceAfterPosting } from "@/lib/bank-balance-utils";

const bank = readFileSync(fileURLToPath(new URL("./bank.tsx", import.meta.url)), "utf8");

// A day at the bank is several postings, not one. Recording them meant filling
// the form, saving, watching it close, and opening it again — and the balance
// only moved once the form had gone, so there was no working down towards the
// closing figure on the statement.
describe("a sitting records a whole day", () => {
  it("offers to save and stay open, except when editing", () => {
    // An edit is one posting by definition; a second button there would only
    // invite a duplicate.
    expect(bank).toContain('data-testid="button-save-and-add-another"');
    expect(bank).toContain("onClick={() => handleSubmit(undefined, { keepOpen: true })}");
    expect(bank).toContain("{!editingTransaction && (");
  });

  it("routes every branch of the submit handler through one ending", () => {
    // Savings transfer, bank-to-bank, deposit, withdrawal and charge each used
    // to call resetForm themselves, which also closed the form.
    const handler = bank.slice(bank.indexOf("const handleSubmit = async ("), bank.indexOf("const handleDelete = async ("));
    expect(handler).not.toContain("resetForm()");
    expect((handler.match(/finishEntry\(/g) ?? []).length).toBe(4);
  });

  it("keeps what a sitting has in common and clears what it does not", () => {
    // The mode, the date and the people stay; the amount, the narration, the
    // category and the destination go.
    const reset = bank.slice(bank.indexOf("const resetForNextEntry = () => {"), bank.indexOf("const resetForm = () => {"));
    expect(reset).toContain('setAmount("");');
    expect(reset).toContain('setExpenseCategory("");');
    expect(reset).not.toContain("setDate(");
    expect(reset).not.toContain("setMode(");
    expect(reset).not.toContain("setDepositorIds(");
  });

  it("still closes the form when the sitting ends", () => {
    const reset = bank.slice(bank.indexOf("const resetForm = () => {"), bank.indexOf("const finishEntry ="));
    expect(reset).toContain("resetForNextEntry();");
    expect(reset).toContain("setSitting(null);");
    expect(reset).toContain("setMode(null);");
  });

  it("counts what the sitting has recorded, both ways", () => {
    expect(bank).toContain('data-testid="bank-sitting-tally"');
    expect(bank).toContain('recorded.direction === "in" ? recorded.amount : 0');
    expect(bank).toContain('recorded.direction === "out" ? recorded.amount : 0');
  });

  it("renames Cancel once a sitting is under way", () => {
    // Nothing is being cancelled by then — the postings are already saved.
    expect(bank).toContain('{sitting !== null ? "Done" : "Cancel"}');
  });
});

// The balance only moved once the form closed and the list refetched, so there
// was no way to watch it fall towards the figure on the statement.
describe("the balance moves as you type", () => {
  it("projects an incoming posting as well as an outgoing one", () => {
    expect(getProjectedBalanceAfterPosting(25000, 5000, "out")).toBe(20000);
    expect(getProjectedBalanceAfterPosting(25000, 5000, "in")).toBe(30000);
  });

  it("takes an edited posting back out before applying the new amount", () => {
    // Otherwise editing a 2,000 withdrawal to 3,000 would project a 5,000 fall.
    expect(getProjectedBalanceAfterPosting(23000, 3000, "out", { amount: 2000, type: "disbursement" })).toBe(22000);
    expect(getProjectedBalanceAfterPosting(27000, 3000, "in", { amount: 2000, type: "deposit" })).toBe(28000);
  });

  it("shows the figure while the amount is still being typed", () => {
    expect(bank).toContain('data-testid="bank-projected-balance"');
    expect(bank).toContain("After this posting");
  });

  it("shows it for a charge or a transfer too, which have no account card", () => {
    expect(bank).toContain('data-testid="bank-projected-balance-compact"');
    expect(bank).toContain('{projectedBalance !== null && mode !== "deposit" && mode !== "disbursement" && (');
  });
});

// "Opening balance 25,000, closing 9,400 — maybe the difference is bank
// charges." Until now that arithmetic happened on paper.
describe("checking the account against the statement", () => {
  it("asks for the statement figure and names the gap", () => {
    expect(bank).toContain('data-testid="button-check-against-statement"');
    expect(bank).toContain('data-testid="input-statement-balance"');
    expect(bank).toContain("Math.round((account.balance - parsedStatementBalance) * 100) / 100");
  });

  it("offers the charge without asserting it", () => {
    // A shortfall is usually a fee on a Kenyan statement. Usually is not
    // always, so the app proposes and the narration stays editable.
    expect(bank).toContain('data-testid="button-record-difference-as-charge"');
    expect(bank).toContain('data-testid="input-reconcile-narration"');
    expect(bank).toContain("but Jamvi will not decide that for you.");
  });

  it("refuses to call a surplus a charge", () => {
    // Money arriving unrecorded is a deposit somebody made, and it needs to be
    // attributed to them rather than written off.
    expect(bank).toContain('data-testid="bank-reconcile-over"');
    expect(bank).toContain('data-testid="button-reconcile-record-deposit"');
    expect(bank).toContain("A charge would be the wrong answer");
  });

  it("says so plainly when the two agree", () => {
    expect(bank).toContain('data-testid="bank-reconcile-matched"');
  });

  it("says the charge will not touch a budget", () => {
    expect(bank).toContain("A charge is kept out of household spending, so this will not touch any budget.");
  });

  it("defaults the narration rather than saving an empty one", () => {
    expect(bank).toContain('narration: reconcileNarration.trim() || "Bank charges",');
  });

  it("lets an overdrawn statement figure be typed", () => {
    // Jamvi records an overdraft rather than refusing it, so the amount parser
    // — which rejects a minus sign, correctly, for an amount — is the wrong one
    // to read a balance with.
    expect(bank).toContain("const parsedStatementBalance = parseBalanceFigure(statementBalance);");
    expect(bank).toContain(String.raw`if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) return null;`);
  });
});
