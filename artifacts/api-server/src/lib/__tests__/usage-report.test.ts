import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanCorrections, MAX_CORRECTIONS } from "../import-corrections";
import { usageReportEmail, type UsageReport } from "../usage-report";

// "Three months of real use tells you which screens matter, where the M-Pesa
// reading files things wrongly ... how do i know this?" (16 Oct 2026).
describe("the M-Pesa corrections are kept with nothing that says whose", () => {
  it("keeps only the kind of line, the business, the suggestion and the choice", () => {
    const kept = cleanCorrections([
      { direction: "out", type: "merchant_payment", payee: "  NAIVAS   WESTLANDS ", suggested: "Groceries", chosen: "Household", userId: "u1", amount: 1200 },
      { direction: "out", type: "paybill_payment", payee: null, suggested: "Rent", chosen: "Rent" },
      { direction: "sideways", suggested: "A", chosen: "B" },
      { direction: "in", suggested: "", chosen: "Salary" },
      "nonsense",
    ]);
    expect(kept).toEqual([{ direction: "out", type: "merchant_payment", payee: "NAIVAS WESTLANDS", suggested: "Groceries", chosen: "Household" }]);
    expect(Object.keys(kept[0])).not.toContain("userId");
  });

  it("takes at most a whole statement's worth from one save", () => {
    const many = Array.from({ length: MAX_CORRECTIONS + 20 }, () => ({ direction: "out", suggested: "A", chosen: "B" }));
    expect(cleanCorrections(many)).toHaveLength(MAX_CORRECTIONS);
  });

  it("stores no person, budget, amount, date or M-Pesa code", () => {
    const table = readFileSync("src/lib/import-corrections.ts", "utf8");
    const create = table.slice(table.indexOf('CREATE TABLE IF NOT EXISTS "import_corrections"'), table.indexOf("CREATE INDEX"));
    for (const column of ["user_id", "group_id", "amount", "receipt", "phone"]) expect(create).not.toContain(column);
    const route = readFileSync("src/routes/import-corrections.ts", "utf8");
    expect(route).toContain("router.post(\"/mpesa/corrections\", correctionsLimiter,");
  });
});

describe("the weekly usage report", () => {
  const report: UsageReport = {
    weekStart: "2026-10-12",
    weekEnd: "2026-10-19",
    signups: 3,
    people: 41,
    activeBudgets: { personal: 9, shared: 2 },
    fourWeeksOn: { made: 4, stillActive: 3 },
    imported: { entries: 612, budgets: 7 },
    notSure: { entries: 30, of: 400 },
    subscriptions: { trial: 11, active: 0, lapsed: 0 },
    corrections: [{ payee: "NAIVAS", suggested: "Groceries", chosen: "Household", times: 12 }, { payee: null, suggested: "Not sure yet", chosen: "Family support", times: 4 }],
  };

  it("says the week's numbers in plain words, to info@", () => {
    const email = usageReportEmail(report);
    expect(email.to).toEqual(["info@jamvi.co.ke"]);
    expect(email.subject).toBe("Jamvi this week: 11 active budgets, 3 new sign-ups");
    expect(email.html).toContain("3 of 4 budgets made then (75%)");
    expect(email.html).toContain("612 entries, in 7 budgets");
    expect(email.html).toContain("30 of 400 (8%)");
    expect(email.html).toContain("NAIVAS");
    expect(email.html).toContain("Groceries &rarr; Household");
    expect(email.html).toContain("(a person)");
  });

  it("runs every Monday morning in Nairobi, and makes its table after the server listens", () => {
    const index = readFileSync("src/index.ts", "utf8");
    expect(index).toContain('"0 8 * * 1"');
    expect(index).toContain("const report = await sendUsageReport();");
    expect(index.indexOf("void ensureImportCorrections();")).toBeGreaterThan(index.indexOf("app.listen("));
  });
});
