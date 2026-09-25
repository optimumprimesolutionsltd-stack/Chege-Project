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

describe("working through a statement over several visits (web)", () => {
  it("keeps what is still to do for a month on this device, never the PDF or its password", () => {
    expect(page).toContain("const STATEMENT_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;");
    expect(page).toContain("jamvi:mpesa-statement:");
    const write = page.slice(page.indexOf("window.localStorage.setItem(statementDraftKey"), page.indexOf("window.localStorage.setItem(statementDraftKey") + 200);
    expect(write).toContain("reading: statementReading");
    expect(write).not.toContain("statementPassword");
    expect(write).not.toContain("statementFile");
  });

  it("does not erase the kept copy before it has been looked at", () => {
    expect(page).toContain("if (draftChecked !== statementDraftKey) return undefined;");
  });

  it("marks what was saved as recorded, asks again on return, and offers to keep going", () => {
    expect(page).toContain('description: "Saved from your statement"');
    expect(page).toContain("markRecorded(saved.reading.lines)");
    expect(page).toContain("mpesa-import-keep-going");
  });
});

describe("the red message names its entry (web)", () => {
  it("scrolls to the entry it is about when clicked", () => {
    expect(page).toContain("scrollIntoView");
    expect(page).toContain('data-testid="mpesa-first-problem"');
  });
});
