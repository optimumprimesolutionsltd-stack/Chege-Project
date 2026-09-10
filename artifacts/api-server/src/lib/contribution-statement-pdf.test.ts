import { describe, expect, it } from "vitest";
import { createContributionStatementPdf } from "./contribution-statement-pdf";

const entries = [
  { date: "2026-07-03", name: "Mary", amount: 2000, source: "deposit" as const, description: "Contributions for July" },
  { date: "2026-08-01", name: "Mary", amount: 2000, source: "recorded" as const, description: null },
  { date: "2026-09-04", name: "Mary", amount: 2500, source: "deposit" as const, description: "Contributions for September" },
];

describe("contribution statement PDF", () => {
  it("renders a single member's statement with a running total", async () => {
    const pdf = await createContributionStatementPdf({
      groupName: "Umoja Chama",
      periodLabel: "Jul 2026 – Sep 2026",
      memberName: "Mary",
      entries,
      total: 6500,
      perMemberTotals: [],
    });
    expect(pdf.subarray(0, 8).toString()).toBe("%PDF-1.3");
    expect(pdf.toString("latin1")).toContain("%%EOF");
    expect(pdf.toString("latin1")).toContain("/Encrypt");
  });

  it("renders the whole-group ledger with a by-member breakdown", async () => {
    const pdf = await createContributionStatementPdf({
      groupName: "Umoja Chama",
      periodLabel: "Sep 2026",
      entries: [
        { date: "2026-09-01", name: "Mary", amount: 2000, source: "deposit" as const, description: null },
        { date: "2026-09-02", name: "John", amount: 1500, source: "deposit" as const, description: null },
      ],
      total: 3500,
      perMemberTotals: [
        { name: "Mary", total: 2000 },
        { name: "John", total: 1500 },
      ],
    });
    expect(pdf.subarray(0, 8).toString()).toBe("%PDF-1.3");
    expect(pdf.toString("latin1")).toContain("%%EOF");
  });

  it("renders when there are no entries", async () => {
    const pdf = await createContributionStatementPdf({
      groupName: "New Group",
      periodLabel: "Sep 2026",
      memberName: "Anon",
      entries: [],
      total: 0,
      perMemberTotals: [],
    });
    expect(pdf.subarray(0, 8).toString()).toBe("%PDF-1.3");
    expect(pdf.toString("latin1")).toContain("%%EOF");
  });
});
