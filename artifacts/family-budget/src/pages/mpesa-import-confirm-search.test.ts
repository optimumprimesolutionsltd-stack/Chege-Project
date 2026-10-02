import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./mpesa-import.tsx", import.meta.url), "utf8");

// The phone's statement tools (#511-#516), brought to the web import.
describe("the web statement import saves only what was confirmed, after asking", () => {
  it("offers Confirm on each suggestion and saves only confirmed lines from a statement", () => {
    expect(page).toContain("data-testid={`mpesa-line-confirm-${item.index}`}");
    expect(page).toContain("if (onlyConfirmed && !isConfirmedToSave(item, choice)) return [];");
    expect(page).toContain("? `Save ${confirmedCount} confirmed`");
    expect(page).toContain("if (!window.confirm(`Save ${confirmedCount}");
  });

  it("finds entries or a category, and confirms or categorises them together after asking", () => {
    expect(page).toContain("&& lineMatches(item, find, choices[item.index]?.category) && inMonth(item, month));");
    expect(page).toContain("setChoices((current) => confirmLines(toConfirm, current));");
    expect(page).toContain("setChoices((current) => categoriseLines(toCategorise, current, name));");
  });

  it("draws the review a hundred at a time, and goes as far as the first problem", () => {
    expect(page).toContain("const LINES_PER_PAGE = 100;");
    expect(page).toContain("{inView.slice(0, shownCount).map((item) => {");
    expect(page).toContain("setShownCount((count) => Math.max(count, Math.ceil((at + 1) / LINES_PER_PAGE) * LINES_PER_PAGE));");
  });
});

describe("reading the statement again, or starting over, on the web", () => {
  it("reads again without clearing the work, keeping every choice", () => {
    expect(page).toContain("{!lines || rereading ? (");
    expect(page).toContain("const built = lines ? carryChoices(lines, choices, shown, fresh) : fresh;");
    expect(page).toContain('data-testid="mpesa-rereading-back"');
  });

  it("asks before reading again or starting over, and says saved entries stay", () => {
    expect(page).toContain('window.confirm("Read this statement again?');
    expect(page).toContain("Anything already saved stays in your budget.");
    expect(page).toContain("onClick={statementReading ? startOverStatement : () => {");
  });
});
