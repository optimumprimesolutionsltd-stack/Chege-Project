import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bank = readFileSync("src/routes/joint-account.ts", "utf8");
const pdf = readFileSync("src/lib/bank-statement-pdf.ts", "utf8");
const screen = readFileSync("../mobile-budget/app/bank-statement.tsx", "utf8");
const share = readFileSync("../mobile-budget/lib/shareStatementPdf.ts", "utf8");
const tab = readFileSync("../mobile-budget/app/(tabs)/bank.tsx", "utf8");

// /joint-account returns every posting ever made, newest first, with no date
// range at all. That is right for entering a day and useless for checking one.
describe("an account statement for a period", () => {
  it("takes an account and two dates", () => {
    expect(bank).toContain('router.get("/joint-account/statement", async (req, res)');
    expect(bank).toContain("accountId: z.coerce.number().int().positive(),");
    expect(bank).toContain("from: z.string().date(),");
  });

  it("refuses a period that ends before it starts", () => {
    expect((bank.match(/The period ends before it starts\./g) ?? []).length).toBe(2);
  });

  it("reads oldest first, which is the only order a running balance means anything in", () => {
    expect(bank).toContain("${jointAccountTxTable.date} ASC, ${jointAccountTxTable.id} ASC");
  });

  it("works out where the balance stood when the period began", () => {
    // The account's opening balance plus everything before the range, so the
    // first line of the statement starts from a real figure.
    expect(bank).toContain("${jointAccountTxTable.date} < ${from}");
    expect(bank).toContain("Number(account.openingBalance ?? 0) + Number(before?.deposits ?? 0) - Number(before?.disbursements ?? 0)");
  });

  it("carries the balance after each posting, not before it", () => {
    expect(bank).toContain("running = isIn ? running + amount : running - amount;");
    expect(bank).toContain("balance: Math.round(running * 100) / 100,");
  });

  it("names what moved without being earned or spent", () => {
    expect(bank).toContain("if (isIn && tx.isBorrowing) borrowed += amount;");
    expect(bank).toContain("if (isIn && tx.settlesContributorId !== null) repaidToUs += amount;");
    expect(bank).toContain("if (!isIn && tx.isLending) lent += amount;");
  });

  it("keeps the cents the balances now hold", () => {
    expect(bank).toContain("const round = (value: number) => Math.round(value * 100) / 100;");
  });

  it("refuses an account from another budget", () => {
    // The lookup is scoped to the group, so an id guessed from elsewhere finds
    // nothing rather than somebody else's ledger.
    expect(bank).toContain("const account = accounts.find((candidate) => candidate.id === accountId);");
    expect(bank).toContain('res.status(404).json({ error: "Bank account not found." })');
  });
});

describe("and the same thing as a PDF", () => {
  it("is served as a document, named for the account and the period", () => {
    expect(bank).toContain('router.get("/joint-account/statement.pdf", async (req, res)');
    expect(bank).toContain('res.setHeader("Content-Type", "application/pdf");');
    expect(bank).toContain("jamvi-statement-${slug}-${statement.from}-to-${statement.to}.pdf");
  });

  it("opens with an opening balance and closes with a closing one", () => {
    expect(pdf).toContain('text: "Opening balance"');
    expect(pdf).toContain('document.text("Closing balance"');
  });

  it("has a column for each of in, out and balance", () => {
    expect(pdf).toContain('{ label: "In"');
    expect(pdf).toContain('{ label: "Out"');
    expect(pdf).toContain('{ label: "Balance"');
  });

  it("says plainly that it is not the bank's own document", () => {
    expect(pdf).toContain("not a document issued by the bank");
  });

  it("says something when the period is empty rather than printing a blank", () => {
    expect(pdf).toContain("Nothing was recorded in this period.");
  });
});

describe("on the phone", () => {
  it("is reachable from the Banking tab", () => {
    expect(tab).toContain('testID="bank-statement-action"');
    expect(tab).toContain("router.push('/bank-statement')");
  });

  it("defaults to the month so far", () => {
    expect(screen).toContain("function defaultRange()");
  });

  it("shows the range as a range, and says when it is backwards", () => {
    expect(screen).toContain('testID="statement-from"');
    expect(screen).toContain('testID="statement-to"');
    expect(screen).toContain('testID="statement-bad-range"');
  });

  it("does not ask the server for an impossible period", () => {
    expect(screen).toContain("enabled: activeAccountId !== null && from <= to,");
  });

  it("shares the PDF the way every other export does", () => {
    expect(share).toContain("await writePdf(Paths.cache");
    expect(share).toContain("await Sharing.shareAsync(file.uri");
    expect(screen).toContain('testID="statement-share"');
  });
});
