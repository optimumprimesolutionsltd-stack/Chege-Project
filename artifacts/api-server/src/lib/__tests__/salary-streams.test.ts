import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { businessWord, salaryStreamsFor } from "../salary-streams";

// "Check why we have two salaries for ujenzi and optimum" (16 Oct 2026): the
// salary stream was looked for by its exact name, so the person's own
// "Ujenzi salary" was missed and "Ujenzi Distributors salary" made beside it.
describe("one salary stream per business", () => {
  const sources = [
    { id: 3, name: "Ujenzi salary" },
    { id: 4, name: "Optimum Salary" },
    { id: 7, name: "Ujenzi Distributors ltd" },
    { id: 8, name: "Optimum Prime Solutions Ltd" },
    { id: 9, name: "Dahanak Ventures" },
    { id: 11, name: "Ujenzi Distributors salary" },
    { id: 12, name: "Optimum Prime Solutions salary" },
    { id: 13, name: "Side Hustle Income" },
    { id: 14, name: "Salary or wages" },
  ];
  const businesses = new Set([7, 8, 9]);

  it("knows each business by its own word", () => {
    expect(businessWord("Ujenzi Distributors ltd")).toBe("ujenzi");
    expect(businessWord("Optimum Prime Solutions Ltd")).toBe("optimum");
    expect(businessWord("Be energy")).toBe("energy");
    expect(businessWord("Co Ltd")).toBeNull();
  });

  it("finds the person's own salary stream first, and the one Jamvi made after it", () => {
    expect(salaryStreamsFor({ id: 7, name: "Ujenzi Distributors ltd" }, sources, businesses).map((s) => s.id)).toEqual([3, 11]);
    expect(salaryStreamsFor({ id: 8, name: "Optimum Prime Solutions Ltd" }, sources, businesses).map((s) => s.id)).toEqual([4, 12]);
  });

  it("never takes a business, another business's salary, or a salary that names no business", () => {
    expect(salaryStreamsFor({ id: 9, name: "Dahanak Ventures" }, sources, businesses)).toEqual([]);
  });

  it("keeps the oldest and moves everything from the others onto it", () => {
    const lib = readFileSync("src/lib/salary-streams.ts", "utf8");
    expect(lib).toContain("const [keep, ...extra] = salaryStreamsFor(business, sources, businessIds);");
    expect(lib).toContain("await moveIncomeSource(trx, groupId, duplicate.id, keep.id);");
    const combine = readFileSync("src/lib/combine-income-sources.ts", "utf8");
    expect(combine).toContain("const moved = await moveIncomeSource(trx, groupId, fromId, intoId);");
  });
});
