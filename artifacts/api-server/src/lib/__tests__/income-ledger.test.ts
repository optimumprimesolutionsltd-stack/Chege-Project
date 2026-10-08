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

function build(deposits: IncomeDepositRow[], splits: IncomeSplitRow[] = [], costs: [number, number][] = []) {
  return buildIncomeLedger({
    from: "2026-09-01", to: "2026-09-30", deposits, splits, streamNames, costsByStream: new Map(costs),
  });
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
    expect(ledger.otherMoneyIn).toEqual({ borrowed: 20000, repaidToYou: 5000, fromSavings: 7000, moneyBack: 0, fromYourBusiness: 0, inBusinessAccounts: 0 });
  });

  it("names every stream and person on a split deposit, once each, in the order entered", () => {
    const ledger = build(
      [deposit({ id: 9, amount: 30000, incomeSourceId: 1, makerName: "Chege" })],
      [
        { transactionId: 9, incomeSourceId: 2, personName: "Lydiah", amount: 10000 },
        { transactionId: 9, incomeSourceId: 1, personName: "Chege", amount: 15000 },
        { transactionId: 9, incomeSourceId: 2, personName: "Lydiah", amount: 5000 },
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

    const split = build([deposit({ id: 2 })], [{ transactionId: 2, incomeSourceId: 1, personName: null, amount: 1000 }]);
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
      received: 0,
      costs: 0,
      streams: [],
      entries: [],
      otherMoneyIn: { borrowed: 0, repaidToYou: 0, fromSavings: 0, moneyBack: 0, fromYourBusiness: 0, inBusinessAccounts: 0 },
    });
  });
});

// A side hustle's income is what it made, not what it sold for: sales less the
// cost of goods and running costs, i.e. spending in the categories linked to it.
describe("a side hustle counts its profit", () => {
  it("takes each stream's costs off what it brought in", () => {
    const ledger = build(
      [
        deposit({ id: 1, amount: 164622, incomeSourceId: 1 }),
        deposit({ id: 2, amount: 50000, incomeSourceId: 2 }),
      ],
      [],
      [[1, 100000]],
    );

    expect(ledger.streams).toEqual([
      { incomeSourceId: 1, name: "Chege – Salary", received: 164622, costs: 100000, net: 64622 },
      { incomeSourceId: 2, name: "Lydiah – EISH", received: 50000, costs: 0, net: 50000 },
    ]);
    expect(ledger.received).toBe(214622);
    expect(ledger.costs).toBe(100000);
    expect(ledger.total).toBe(114622);
  });

  it("shows a loss as a loss, not as nothing", () => {
    const ledger = build([deposit({ id: 1, amount: 20000, incomeSourceId: 1 })], [], [[1, 26000]]);
    expect(ledger.streams[0].net).toBe(-6000);
    expect(ledger.total).toBe(-6000);
  });

  it("counts a stream that cost money in a period it sold nothing", () => {
    const ledger = build([deposit({ id: 1, amount: 30000, incomeSourceId: 2 })], [], [[1, 4000]]);
    expect(ledger.streams.find((stream) => stream.incomeSourceId === 1)).toEqual(
      { incomeSourceId: 1, name: "Chege – Salary", received: 0, costs: 4000, net: -4000 },
    );
    expect(ledger.total).toBe(26000);
  });

  it("ignores costs linked to a stream the group does not own", () => {
    const ledger = build([deposit({ id: 1, amount: 30000, incomeSourceId: 2 })], [], [[99, 4000]]);
    expect(ledger.costs).toBe(0);
    expect(ledger.total).toBe(30000);
  });

  it("credits each stream of a split deposit with its own share only", () => {
    const ledger = build(
      [deposit({ id: 9, amount: 30000 })],
      [
        { transactionId: 9, incomeSourceId: 1, personName: "Chege", amount: 20000 },
        { transactionId: 9, incomeSourceId: 2, personName: "Lydiah", amount: 10000 },
      ],
    );
    expect(ledger.streams.map((stream) => [stream.incomeSourceId, stream.received])).toEqual([[1, 20000], [2, 10000]]);
    expect(ledger.entries[0].portions).toEqual([
      { incomeSourceId: 1, amount: 20000 },
      { incomeSourceId: 2, amount: 10000 },
    ]);
  });

  it("keeps money with no stream as received in full, since nothing is linked to it", () => {
    const ledger = build([deposit({ id: 1, amount: 3000, incomeSourceId: null })], [], [[1, 500]]);
    expect(ledger.streams.find((stream) => stream.incomeSourceId === null)).toMatchObject({ received: 3000, costs: 0, net: 3000 });
  });
});

// "Remember the unattributed is due to M-Pesa reversals": money back from a
// reversed payment only returns what left, so it is never income.
describe("money back from a reversed payment", () => {
  it("is kept out of income and out of every stream, but totalled beside it", () => {
    const ledger = build([
      deposit({ id: 1, amount: 50000, incomeSourceId: 1 }),
      deposit({ id: 2, amount: 16727, kind: "money_back", description: "Money back: a reversed payment" }),
      deposit({ id: 3, amount: 18483, kind: "money_back", description: "Money back: a reversed payment" }),
    ]);
    expect(ledger.entries.map((entry) => entry.transactionId)).toEqual([1]);
    expect(ledger.total).toBe(50000);
    expect(ledger.streams.some((stream) => stream.incomeSourceId === null)).toBe(false);
    expect(ledger.otherMoneyIn.moneyBack).toBe(35210);
  });
});
