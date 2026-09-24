import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// Same bug as mobile: in Monthly grid mode both Download and WhatsApp used the
// dated ledger, so the expected-versus-given sheet could never be produced.
describe("web Monthly grid exports the grid, not the ledger", () => {
  const source = read("../components/download-contributions.tsx");
  const download = source.slice(source.indexOf("const download = () =>"), source.indexOf("const shareToWhatsApp"));
  const share = source.slice(source.indexOf("const shareToWhatsApp"), source.indexOf("return (\n    <div className=\"flex flex-col gap-3 rounded-xl"));

  it("downloads report.pdf in grid mode and statement.pdf otherwise", () => {
    expect(download).toContain('mode === "grid"');
    expect(download).toContain("/api/contributions/report.pdf?months=${months}");
    expect(download).toContain("statementPdfUrl(viewRange.from, viewRange.to");
  });
  it("shares the grid summary in grid mode", () => {
    expect(share).toContain('mode === "grid"');
    expect(share).toContain("buildContributionWhatsAppText(report, verifyUrl)");
    expect(share).toContain("buildStatementWhatsAppText(share, verifyUrl)");
  });
});

describe("web day of banking asks where money in came from", () => {
  const day = read("../pages/bank-day.tsx");
  it("offers the income streams on money-in rows and posts the choice", () => {
    expect(day).toContain('row.kind === "money-in" && incomeSources.length > 0');
    expect(day).toContain('data-testid={`select-day-income-source-${index}`}');
    expect(day).toContain('...(row.kind === "money-in" && row.incomeSourceId !== "none" ? { incomeSourceId: Number(row.incomeSourceId) } : {}),');
  });
});
