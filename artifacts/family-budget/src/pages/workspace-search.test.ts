import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const search = readFileSync("src/pages/search.tsx", "utf8");
const layout = readFileSync("src/components/layout.tsx", "utf8");

describe("workspace search", () => {
  it("is reachable from navigation and filters current-budget records", () => {
    expect(layout).toContain("{ href: '/search', label: 'Search'");
    expect(search).toContain('/api/search?q=');
    expect(search).toContain('"expenses", label: "Expenses"');
    expect(search).toContain('"bank", label: "Bank"');
    expect(search).toContain('"goals", label: "Goals"');
    expect(search).toContain('"income", label: "Income"');
    expect(search).toContain("Results never cross into another budget.");
  });
});