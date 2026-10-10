import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/pages/teach-jamvi.tsx", "utf8");
const app = readFileSync("src/App.tsx", "utf8");
const settings = readFileSync("src/pages/settings.tsx", "utf8");

// Teach Jamvi on the web too (10 Oct 2026): the same questions, the phone's own logic.
describe("Teach Jamvi on the web", () => {
  it("is a page reached from Settings by whoever manages the budget", () => {
    expect(app).toContain('<Route path="/teach-jamvi" component={TeachJamvi} />');
    expect(settings).toContain('data-testid="teach-jamvi-entry"');
    expect(settings).toContain("{canManageWorkspace ? (");
  });

  it("asks the salary question, the family and the regulars, from the shared twins", () => {
    expect(page).toContain('from "@/lib/teach-jamvi"');
    expect(page).toContain('from "@/lib/family"');
    expect(page).toContain('from "@/lib/business-salary"');
    for (const id of ["teach-salary", "teach-family", "teach-regular"]) expect(page).toContain(`data-testid="${id}"`);
  });

  it("keeps every answer on the server through the rules store", () => {
    expect(page).toContain("void saveRules(group?.id, next, before);");
    expect(page).toContain('body: JSON.stringify({ business: true, paysSalary })');
  });
});
