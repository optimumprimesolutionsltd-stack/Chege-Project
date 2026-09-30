import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const banner = readFileSync("src/components/import-tidy-banner.tsx", "utf8");
const bank = readFileSync("src/pages/bank.tsx", "utf8");

// The phone's "Tidy imported entries?" on the web, with the way to leave them.
describe("tidy imported entries on the web", () => {
  it("names the entries and offers Tidy them or Leave as they are, for the entries shown", () => {
    expect(banner).toContain('data-testid="import-tidy-apply"');
    expect(banner).toContain('data-testid="import-tidy-leave"');
    expect(banner).toContain('"/api/joint-account/import-tidy/keep"');
    expect(banner).toContain("body: JSON.stringify({ accountId, ids })");
  });

  it("sits on Bank for the account shown, for whoever may manage it", () => {
    expect(bank).toContain("<ImportTidyBanner accountId={selectedAccountId ?? accounts[0]?.id ?? null} canManage={canManageAccount} />");
  });
});

describe("the web report PDF and contributions", () => {
  it("lets the lists be laid out by group, as a summary or detailed", () => {
    const report = readFileSync("src/pages/income-streams-report.tsx", "utf8");
    expect(report).toContain('data-testid="select-pdf-expenses-layout"');
    expect(report).toContain('data-testid="select-pdf-income-layout"');
    expect(report).toContain('...pdfLayoutParams(pdfSections.expenses ? expensesLayout : "date", pdfSections.incomeEntries ? incomeLayout : "date"),');
  });

  it("shows where each member's money came from, their entries, and last month", () => {
    const contributions = readFileSync("src/pages/contributions.tsx", "utf8");
    expect(contributions).toContain("<MemberSources userId={userId} month={month} year={year} />");
    expect(contributions).toContain('data-testid="contributions-vs-last-month"');
    expect(contributions).toContain('data-testid="contributions-empty-month"');
  });
});
