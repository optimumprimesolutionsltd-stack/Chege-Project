/**
 * A deposit has to say which account received it.
 *
 * There is no main account any more. When the form left accountId out, the
 * server fell back to the lowest-numbered account - so every quick-log deposit
 * landed in whichever account was created first, with no picker and nothing on
 * screen saying where the money had gone. A group with a bank and an M-Pesa
 * till could not record into the till at all.
 *
 * These assert on the source, in the same style as the other dashboard tests,
 * because the behaviour lives in a form too large to mount here.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("./dashboard.tsx", import.meta.url)), "utf8");

/** The deposit form, so an assertion cannot pass because of the expense form
 *  further down the file. */
const incomeForm = source.slice(
  source.indexOf("function IncomeForm({"),
  source.indexOf("function ExpenseForm({"),
);

describe("recording a deposit", () => {
  it("sends the chosen account rather than letting the server guess", () => {
    expect(incomeForm).toContain("accountId,");
  });

  it("refuses to record until an account is chosen", () => {
    expect(incomeForm).toContain('title: "Choose an account"');
    expect(incomeForm).toContain("if (!accountId) {");
  });

  it("selects the only account there is, instead of asking a question with one answer", () => {
    expect(incomeForm).toContain("if (accounts.length === 1) setAccountId(accounts[0].id);");
  });

  it("names that account on screen, so nobody has to guess where the money went", () => {
    expect(incomeForm).toContain("{accounts[0]?.name ?? \"Loading…\"}");
  });

  it("offers to create an account without leaving the deposit", () => {
    // A treasurer recording an M-Pesa deposit should not have to abandon the
    // form, go to the bank page, come back, and retype everything.
    expect(incomeForm).toContain('data-testid="add-deposit-account-inline"');
    expect(incomeForm).toContain("createAccount.mutate(");
    // And the new account is the one being deposited into.
    expect(incomeForm).toContain("setAccountId(created.id);");
  });

  it("prompts for an account rather than failing silently when there are none", () => {
    expect(incomeForm).toContain('title: "Add an account first"');
    expect(incomeForm).toContain("setIsAddingAccount(true);");
  });
});

describe("simple and advanced deposits", () => {
  it("offers the toggle, which the form declared and never used", () => {
    // formMode existed here as dead state while expenses had the real thing.
    expect(incomeForm).toContain("deposit-mode-${value}");
    expect(incomeForm).toContain('aria-pressed={formMode === value}');
    expect(incomeForm).toContain('onClick={() => setFormMode(value)}');
  });

  it("keeps income source out of the simple form", () => {
    expect(incomeForm).toContain('formMode === "advanced" && incomeSources');
  });

  it("still asks which account in simple, when there is a real choice", () => {
    // Hiding this behind Advanced would recreate the bug: a two-account group
    // recording into the wrong one without being asked.
    expect(incomeForm).toContain('accounts.length > 1 || formMode === "advanced" || accounts.length === 0');
  });
});
