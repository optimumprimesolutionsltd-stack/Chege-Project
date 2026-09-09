import { describe, expect, it } from "vitest";
import { buildContributionWhatsAppText, type GroupContributionReport } from "./contribution-report";

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
