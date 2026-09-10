import { describe, expect, it } from "vitest";
import {
  buildContributionWhatsAppText,
  buildStatementWhatsAppText,
  type GroupContributionReport,
  type StatementShare,
} from "./contribution-report";

const months = [
  { month: 7, year: 2026, label: "Jul 2026" },
  { month: 8, year: 2026, label: "Aug 2026" },
  { month: 9, year: 2026, label: "Sep 2026" },
];

describe("buildContributionWhatsAppText", () => {
  it("lays out a header, summary block and numbered members with standing", () => {
    const report: GroupContributionReport = {
      budgetName: "Umoja Chama",
      months,
      rows: [
        { name: "Mary", monthlyTarget: 2000, amounts: [2000, 2000, 2000], total: 6000 },
        { name: "John", monthlyTarget: 2000, amounts: [2000, 0, 0], total: 2000 },
        { name: "Grace", monthlyTarget: 2000, amounts: [8000, 0, 0], total: 8000 },
      ],
      grandTotal: 16000,
    };

    const text = buildContributionWhatsAppText(report);

    expect(text).toContain("*Umoja Chama*");
    expect(text).toContain("Contribution report  |  Jul 2026 – Sep 2026");
    expect(text).toMatch(/^As at /m);
    expect(text).toContain("*Summary*");
    expect(text).toContain("Members: 3   Paid up: 2   Behind: 1");
    expect(text).toContain("Collected: KES 16,000 of KES 18,000 expected");
    expect(text).toContain("Shortfall: KES 2,000");
    expect(text).toContain("1. Mary: KES 6,000");
    expect(text).toContain("2. John: KES 2,000  — short KES 4,000");
    expect(text).toContain("3. Grace: KES 8,000  — KES 2,000 ahead");
    expect(text.trimEnd().endsWith("Prepared with Jamvi")).toBe(true);
  });

  it("reports a surplus when the group is over the expected total", () => {
    const report: GroupContributionReport = {
      budgetName: "Group",
      months: [months[0]],
      rows: [{ name: "A", monthlyTarget: 1000, amounts: [1500], total: 1500 }],
      grandTotal: 1500,
    };
    expect(buildContributionWhatsAppText(report)).toContain("Surplus: KES 500");
  });

  it("drops the expected/shortfall lines when no member has a monthly target", () => {
    const report: GroupContributionReport = {
      budgetName: "Grace Chapel",
      months,
      rows: [{ name: "Anon", monthlyTarget: null, amounts: [500, 0, 0], total: 500 }],
      grandTotal: 500,
    };

    const text = buildContributionWhatsAppText(report);
    expect(text).toContain("Members: 1");
    expect(text).toContain("Collected: KES 500");
    expect(text).not.toContain("expected");
    expect(text).not.toContain("Shortfall");
    expect(text).toContain("1. Anon: KES 500");
  });

  it("adds the verification link when one is given, before the sign-off", () => {
    const text = buildContributionWhatsAppText(
      { budgetName: "Group", months: [months[0]], rows: [], grandTotal: 0 },
      "https://jamvi.co.ke/r/1g-4f9a2c1b7d",
    );
    expect(text).toContain("Check this is genuine — the figures update live:");
    expect(text).toContain("https://jamvi.co.ke/r/1g-4f9a2c1b7d");
    expect(text.indexOf("jamvi.co.ke/r/")).toBeLessThan(text.indexOf("Prepared with Jamvi"));
  });

  it("omits the verification block when no link is given", () => {
    const text = buildContributionWhatsAppText({
      budgetName: "Group",
      months: [months[0]],
      rows: [],
      grandTotal: 0,
    });
    expect(text).not.toContain("Check this is genuine");
  });

  it("handles a group with no contributors", () => {
    const text = buildContributionWhatsAppText({
      budgetName: "New Group",
      months: [months[0]],
      rows: [],
      grandTotal: 0,
    });
    expect(text).toContain("No contributors recorded yet.");
  });
});

describe("buildStatementWhatsAppText", () => {
  const statement: StatementShare = {
    budgetName: "Umoja Chama",
    periodLabel: "1 Aug 2026 – 15 Aug 2026",
    entries: [
      { date: "2026-08-03", name: "Mary", amount: 2000, source: "recorded" },
      { date: "2026-08-10", name: "John", amount: 1500, source: "deposit" },
    ],
    perMember: [
      { name: "Mary", total: 2000 },
      { name: "John", total: 1500 },
      { name: "Grace", total: 0 },
    ],
    grandTotal: 3500,
  };

  it("leads with the period and a movements total, not expected-vs-actual", () => {
    const text = buildStatementWhatsAppText(statement);
    expect(text).toContain("Contribution ledger  |  1 Aug 2026 – 15 Aug 2026");
    expect(text).toContain("Total in this period: KES 3,500   (2 entries)");
    expect(text).not.toContain("expected");
  });

  it("lists each dated entry and marks bank deposits", () => {
    const text = buildStatementWhatsAppText(statement);
    expect(text).toContain("3 Aug  Mary  KES 2,000");
    expect(text).toContain("10 Aug  John  KES 1,500  (bank)");
  });

  it("drops members with nothing in the period from the breakdown", () => {
    const text = buildStatementWhatsAppText(statement);
    expect(text).toContain("1. Mary: KES 2,000");
    expect(text).not.toContain("Grace");
  });

  it("adds the verify link only when given", () => {
    expect(buildStatementWhatsAppText(statement)).not.toContain("Check this is genuine");
    expect(buildStatementWhatsAppText(statement, "https://jamvi.co.ke/r/abc")).toContain(
      "https://jamvi.co.ke/r/abc",
    );
  });

  it("handles an empty period", () => {
    const text = buildStatementWhatsAppText({
      ...statement,
      entries: [],
      perMember: [],
      grandTotal: 0,
    });
    expect(text).toContain("Nothing recorded in this period.");
    expect(text).toContain("(0 entries)");
  });
});
