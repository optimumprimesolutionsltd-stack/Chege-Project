import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const web = read(fileURLToPath(new URL("./bank-day.tsx", import.meta.url)));
const mobile = read(fileURLToPath(new URL("../../../mobile-budget/app/bank-day.tsx", import.meta.url)));

// Reported as: "if you select money in, then we shouldnt have bank charges and
// categories", and a screenshot of "HTTP 400: Choose a named depositor before
// selecting an income source" that saved nothing.
describe.each([
  ["web", web],
  ["mobile", mobile],
])("%s day of banking, money in", (_name, source) => {
  it("only money going out carries bank charges", () => {
    expect(source).toContain("function chargesOf");
    expect(source).toContain("isOutgoing(row.kind) ? row.charges : []");
    expect(source).not.toMatch(/for \(const charge of row\.charges\)/);
    expect(source).not.toMatch(/const fees = row\.charges\.reduce/);
  });

  it("names the income source's owner as the depositor", () => {
    expect(source).toContain("incomeSources.find(");
    expect(source).toMatch(/\?\.userId \?\?/);
  });
});

describe("the charge fields are not drawn for money in", () => {
  it("web", () => {
    expect(web).toContain("{isOutgoing(row.kind) ? (\n              <div className=\"space-y-2 sm:col-span-6\" data-testid={`day-charges-${index}`}>");
  });
  it("mobile", () => {
    expect(mobile).toContain("{isOutgoing(row.kind) ? (\n                  <TextInput\n                    value={row.charges[0]?.amount");
    expect(mobile).toContain("isOutgoing(row.kind) && row.charges[0] && row.charges[0].amount.trim() !== ''");
  });
});
