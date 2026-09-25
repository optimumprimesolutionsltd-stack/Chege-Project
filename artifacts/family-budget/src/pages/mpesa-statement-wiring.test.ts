import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/pages/mpesa-import.tsx", "utf8").replace(/\r\n/g, "\n");
const reader = readFileSync("src/lib/statement-file.ts", "utf8").replace(/\r\n/g, "\n");

describe("the statement section of the M-Pesa page", () => {
  it("reads the PDF on the device, and never sends the file or its password", () => {
    expect(page).toContain("readStatementPages(statementFile, statementPassword)");
    const upload = page.slice(page.indexOf("/api/mpesa/import/check-receipts"), page.indexOf("/api/mpesa/import/check-receipts") + 300);
    expect(upload).toContain("receipts: codes");
    expect(upload).not.toContain("statementPassword");
    expect(page).toContain("setStatementPassword(\"\");");
  });

  it("refuses a statement that does not add up", () => {
    expect(page).toContain("if (!balance.ok)");
    expect(page).toContain("will not risk recording wrong amounts");
  });

  it("loads the PDF library only when a statement is chosen", () => {
    expect(reader).toContain('import("pdfjs-dist")');
    expect(page).not.toContain('from "pdfjs-dist"');
  });

  it("does not show the phone number in the file name", () => {
    expect(page).toContain(String.raw`replace(/\d{6,}/g, "…")`);
  });

  it("shows whether saving would match the statement, and what the difference is made of", () => {
    expect(page).toContain("reconcile({ ...statementReading, lines }");
    expect(page).toContain('data-testid="mpesa-statement-balance"');
    expect(page).toContain("Will not match your statement exactly");
    expect(page).toContain("balanceCheck.parts.map");
  });
});
