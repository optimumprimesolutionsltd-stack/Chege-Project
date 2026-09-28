import { describe, expect, it } from "vitest";
import {
  buildIncomeLedger,
  NO_INCOME_STREAM,
  NOT_RECORDED,
  type IncomeDepositRow,
  type IncomeSplitRow,
} from "../income-ledger";

function deposit(overrides: Partial<IncomeDepositRow> & { id: number }): IncomeDepositRow {
  return {
    date: "2026-09-10",
    description: "Salary",
    amount: 1000,
    incomeSourceId: null,
    makerName: "Chege",
    accountName: null,
    kind: "income",
    ...overrides,
  };
}

const streamNames = new Map([
  [1, "Chege – Salary"],
  [2, "Lydiah – EISH"],
]);

function build(deposits: IncomeDepositRow[], splits: IncomeSplitRow[] = []) {
  return buildIncomeLedger({ from: "2026-09-01", to: "2026-09-30", deposits, splits, streamNames });
}

describe("the income ledger", () => {
  it("lists income newest first, and totals only what counts as income", () => {
    const ledger = build([
      deposit({ id: 1, date: "2026-09-02", amount: 50000, incomeSourceId: 1 }),
      deposit({ id: 2, date: "2026-09-20", amount: 12000, incomeSourceId: 2, makerName: "Lydiah" }),
      deposit({ id: 3, date: "2026-09-20", amount: 3000 }),
    ]);

    expect(ledger.entries.map((entry) => entry.transactionId)).toEqual([3, 2, 1]);
    expect(ledger.total).toBe(65000);
    expect(ledger.entries[1]).toMatchObject({
      id: "deposit-2",
      streams: ["Lydiah – EISH"],
      receivedFrom: "Lydiah",
    });
  });

  it("keeps borrowing, repayments to you and money from savings out of the list, but totals them", () => {
    const ledger = build([
      deposit({ id: 1, amount: 40000, incomeSourceId: 1 }),
      deposit({ id: 2, amount: 20000, kind: "borrowed" }),
      deposit({ id: 3, amount: 5000, kind: "repaid" }),
      deposit({ id: 4, amount: 7000, kind: "from_savings" }),
    ]);

    expect(ledger.entries.map((entry) => entry.transactionId)).toEqual([1]);
    expect(ledger.total).toBe(40000);
    expect(ledger.otherMoneyIn).toEqual({ borrowed: 20000, repaidToYou: 5000, fromSavings: 7000 });
  });

  it("names every stream and person on a split deposit, once each, in the order entered", () => {
    const ledger = build(
      [deposit({ id: 9, amount: 30000, incomeSourceId: 1, makerName: "Chege" })],
      [
        { transactionId: 9, incomeSourceId: 2, personName: "Lydiah" },
        { transactionId: 9, incomeSourceId: 1, personName: "Chege" },
        { transactionId: 9, incomeSourceId: 2, personName: "Lydiah" },
      ],
    );

    // The deposit's own stream and maker are not used once it has portions.
    expect(ledger.entries[0].streams).toEqual(["Lydiah – EISH", "Chege – Salary"]);
    expect(ledger.entries[0].receivedFrom).toBe("Lydiah + Chege");
    // A split deposit is still one row, at its full amount.
    expect(ledger.entries[0].amount).toBe(30000);
  });

  it("says so when no stream was chosen, or the stream is not the group's", () => {
    const ledger = build([
      deposit({ id: 1, incomeSourceId: null }),
      deposit({ id: 2, incomeSourceId: 99 }),
    ]);

    expect(ledger.entries.map((entry) => entry.streams)).toEqual([[NO_INCOME_STREAM], [NO_INCOME_STREAM]]);
  });

  it("does not invent a person when nobody was recorded", () => {
    const ledger = build([deposit({ id: 1, makerName: null })], []);
    expect(ledger.entries[0].receivedFrom).toBe(NOT_RECORDED);

    const split = build([deposit({ id: 2 })], [{ transactionId: 2, incomeSourceId: 1, personName: null }]);
    expect(split.entries[0].receivedFrom).toBe(NOT_RECORDED);
  });

  it("reads a numeric amount that arrives from the database as a string", () => {
    const ledger = build([deposit({ id: 1, amount: "2500.50" as unknown as number })]);
    expect(ledger.total).toBe(2500.5);
  });

  it("is empty, not an error, for a period with nothing in it", () => {
    expect(build([])).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
      total: 0,
      entries: [],
      otherMoneyIn: { borrowed: 0, repaidToYou: 0, fromSavings: 0 },
    });
  });
});
