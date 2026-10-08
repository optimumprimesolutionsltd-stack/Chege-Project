import { describe, expect, it } from "vitest";
import { BANK_NAME, FROM_PEOPLE_BANKS_AGENTS } from "./entries-to-sort";

// "Ensure to sort what is done historically" (8 Oct 2026): which saved money in
// is listed to check its source. The patterns run in Postgres (~*); \y is its
// word edge, JavaScript's \b.
const listed = (description: string) =>
  new RegExp(FROM_PEOPLE_BANKS_AGENTS, "i").test(description) || new RegExp(BANK_NAME.replace(/\\y/g, "\\b"), "i").test(description);

describe("money in listed to check its source", () => {
  it("from a person, a bank or an agent", () => {
    expect(listed("Received from Paul Mouguo")).toBe(true);
    expect(listed("Money received")).toBe(true);
    expect(listed("Deposit of Funds at Agent Till 337638 - Joy Shop")).toBe(true);
    expect(listed("National Bank")).toBe(true);
    expect(listed("Equity Paybill Account")).toBe(true);
    expect(listed("KCB M-PESA transfer")).toBe(true);
  });

  it("not other money in", () => {
    expect(listed("ACME LTD SALARY")).toBe(false);
    expect(listed("Money received back")).toBe(false);
    expect(listed("Kibanda")).toBe(false);
  });
});
