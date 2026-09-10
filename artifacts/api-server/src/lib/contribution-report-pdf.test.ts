import { describe, expect, it } from "vitest";
import { createContributionReportPdf } from "./contribution-report-pdf";

const months = [{ label: "Jul 2026" }, { label: "Aug 2026" }, { label: "Sep 2026" }];

describe("contribution report PDF", () => {
  it("renders a multi-month sheet with expected, given and standing", async () => {
    const pdf = await createContributionReportPdf({
      groupName: "Umoja Chama",
      periodLabel: "Jul 2026 – Sep 2026",
      months,
      rows: [
        {
          name: "Mary",
          monthlyTarget: 2_000,
          amounts: [2_000, 2_000, 2_000],
          total: 6_000,
          outstanding: [0, 0, 0],
          creditRemaining: 0,
        },
        {
          name: "John",
          monthlyTarget: 2_000,
          amounts: [2_000, 0, 0],
          total: 2_000,
          outstanding: [0, 2_000, 2_000],
          creditRemaining: 0,
        },
        {
          name: "Grace",
          monthlyTarget: 2_000,
          amounts: [8_000, 0, 0],
          total: 8_000,
          outstanding: [0, 0, 0],
          creditRemaining: 2_000,
        },
      ],
      grandTotal: 16_000,
      totalExpected: 18_000,
    });

    expect(pdf.subarray(0, 8).toString()).toBe("%PDF-1.3");
    expect(pdf.length).toBeGreaterThan(3_000);
    expect(pdf.toString("latin1")).toContain("%%EOF");
  });

  it("still produces a valid PDF with a verify URL and encryption enabled", async () => {
    const pdf = await createContributionReportPdf({
      groupName: "Umoja Chama",
      periodLabel: "Jul 2026 – Sep 2026",
      months,
      rows: [
        { name: "Mary", monthlyTarget: 2_000, amounts: [2_000, 2_000, 2_000], total: 6_000, outstanding: [0, 0, 0], creditRemaining: 0 },
      ],
      grandTotal: 6_000,
      totalExpected: 6_000,
      verifyUrl: "https://jamvi.co.ke/r/1g-4f9a2c1b7d",
    });

    expect(pdf.subarray(0, 8).toString()).toBe("%PDF-1.3");
    expect(pdf.toString("latin1")).toContain("%%EOF");
    // An /Encrypt dictionary is present once permissions are set.
    expect(pdf.toString("latin1")).toContain("/Encrypt");
  });

  it("renders when a group has no contributors and no expectations", async () => {
    const pdf = await createContributionReportPdf({
      groupName: "New Group",
      periodLabel: "Sep 2026",
      months: [{ label: "Sep 2026" }],
      rows: [],
      grandTotal: 0,
      totalExpected: 0,
    });

    expect(pdf.subarray(0, 8).toString()).toBe("%PDF-1.3");
    expect(pdf.toString("latin1")).toContain("%%EOF");
  });

  it("handles voluntary giving where no member has a monthly target", async () => {
    const pdf = await createContributionReportPdf({
      groupName: "Grace Chapel",
      periodLabel: "Aug 2026 – Sep 2026",
      months: [{ label: "Aug 2026" }, { label: "Sep 2026" }],
      rows: [
        {
          name: "Anon",
          monthlyTarget: null,
          amounts: [500, 0],
          total: 500,
          outstanding: [null, null],
          creditRemaining: 0,
        },
      ],
      grandTotal: 500,
      totalExpected: 0,
    });

    expect(pdf.subarray(0, 8).toString()).toBe("%PDF-1.3");
    expect(pdf.toString("latin1")).toContain("%%EOF");
  });
});
