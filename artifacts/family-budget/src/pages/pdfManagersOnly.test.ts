import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

describe("members never see a PDF button (web)", () => {
  it("gates the monthly PDF, the bank statement PDF and the contribution ledger links", () => {
    expect(read("./income-streams-report.tsx")).toContain("{canDownloadPdf ? <Button");
    expect(read("./statement.tsx")).toContain("{canDownloadPdf ? (\n            <Button type=\"button\" onClick={openPdf}");
    const contributions = read("./contributions.tsx");
    expect(contributions).toContain("{canManageContributions ? (\n              <button\n                type=\"button\"\n                onClick={openGroupLedger}");
    expect(contributions).toContain("{canDownloadPdf ? (\n            <button\n              type=\"button\"\n              onClick={onOpenLedger}");
  });
});
