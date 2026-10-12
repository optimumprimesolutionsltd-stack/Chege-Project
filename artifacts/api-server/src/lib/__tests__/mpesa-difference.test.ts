import { describe, expect, it } from "vitest";
import { findDifference, isAnotherLine, mpesaCode, nextDay, statementMade, type DifferenceMessage, type LedgerEntry } from "../mpesa-difference";

// A small M-Pesa history: 1,000 to start, then a payment, money in, another payment.
const at = (day: string, hour: number) => new Date(`${day}T${String(hour).padStart(2, "0")}:00:00+03:00`).getTime();
const messages: DifferenceMessage[] = [
  { receipt: "AAA0000001", balance: 700, at: at("2026-10-01", 9), day: "2026-10-01" },   // paid 300
  { receipt: "AAA0000002", balance: 2700, at: at("2026-10-02", 9), day: "2026-10-02" },  // received 2,000
  { receipt: "AAA0000003", balance: 2200, at: at("2026-10-03", 9), day: "2026-10-03" },  // paid 500
];
const right: LedgerEntry[] = [
  { id: 1, date: "2026-10-01", signed: -300, receipt: "AAA0000001", description: "Shop" },
  { id: 2, date: "2026-10-02", signed: 2000, receipt: "AAA0000002", description: "Salary" },
  { id: 3, date: "2026-10-03", signed: -500, receipt: "AAA0000003", description: "Rent" },
];

describe("find the difference", () => {
  it("finds nothing when every day agrees", () => {
    const result = findDifference(messages, right, 1000)!;
    expect(result).toMatchObject({ from: "2026-10-01", to: "2026-10-03", checkedDays: 3, startGap: 0, endGap: 0, spans: [] });
  });

  it("puts a missing starting balance before the messages begin, not on a day", () => {
    const result = findDifference(messages, right, 0)!;
    expect(result.startGap).toBe(1000);
    expect(result.endGap).toBe(1000);
    expect(result.spans).toEqual([]);
  });

  it("finds money in that this account never got, and where it was saved instead", () => {
    const ledger = right.filter((entry) => entry.id !== 2);
    const result = findDifference(messages, ledger, 1000, new Map([["AAA0000002", { account: "Equity", date: "2026-10-02" }]]))!;
    expect(result.endGap).toBe(2000);
    expect(result.spans).toHaveLength(1);
    expect(result.spans[0]).toMatchObject({
      from: "2026-10-02",
      to: "2026-10-02",
      change: 2000,
      missing: [{ receipt: "AAA0000002", day: "2026-10-02", savedIn: "Equity", savedOn: "2026-10-02" }],
      extra: [],
    });
  });

  it("finds spending counted twice: once typed by hand, once from the message", () => {
    const ledger = [...right, { id: 9, date: "2026-10-03", signed: -500, receipt: null, description: "Rent (typed)" }];
    const result = findDifference(messages, ledger, 1000)!;
    expect(result.endGap).toBe(500);
    expect(result.spans[0]).toMatchObject({
      from: "2026-10-03",
      to: "2026-10-03",
      change: 500,
      extra: [{ id: 9, date: "2026-10-03", amount: -500, description: "Rent (typed)", receipt: null }],
      missing: [],
    });
  });

  it("finds an entry saved under a different day from its message, which moves the gap and moves it back", () => {
    const ledger = right.map((entry) => (entry.id === 2 ? { ...entry, date: "2026-10-03" } : entry));
    const result = findDifference(messages, ledger, 1000)!;
    expect(result.endGap).toBe(0);
    expect(result.spans.map((span) => span.change)).toEqual([2000, -2000]);
    expect(result.spans[0].redated).toEqual([
      { id: 2, receipt: "AAA0000002", messageDay: "2026-10-02", savedDate: "2026-10-03", amount: 2000, description: "Salary" },
    ]);
  });

  it("uses each day's last message, whatever order they arrive in", () => {
    const sameDay: DifferenceMessage[] = [
      { receipt: "BBB0000002", balance: 400, at: at("2026-10-01", 15), day: "2026-10-01" },
      { receipt: "BBB0000001", balance: 900, at: at("2026-10-01", 8), day: "2026-10-01" },
    ];
    const ledger: LedgerEntry[] = [
      { id: 1, date: "2026-10-01", signed: -100, receipt: "BBB0000001", description: "a" },
      { id: 2, date: "2026-10-01", signed: -500, receipt: "BBB0000002", description: "b" },
    ];
    expect(findDifference(sameDay, ledger, 1000)).toMatchObject({ startGap: 0, endGap: 0, spans: [] });
  });

  it("has nothing to say without messages that state a balance", () => {
    expect(findDifference([], right, 0)).toBeNull();
  });

  // Fix all once brought in Fuliza repayments, which the import never saves (5 Oct 2026).
  it("never calls a Fuliza message missing, nor a charge or Fuliza fee extra", () => {
    const withFuliza: DifferenceMessage[] = [
      ...messages,
      { receipt: "AAA0000004", balance: 2200, at: at("2026-10-04", 9), day: "2026-10-04" },
      { receipt: "FUL0000005", balance: 1900, at: at("2026-10-05", 9), day: "2026-10-05", record: false },
    ];
    const ledger: LedgerEntry[] = [
      ...right,
      { id: 4, date: "2026-10-04", signed: -500, receipt: "AAA0000004", description: "Shop on Fuliza" },
      { id: 5, date: "2026-10-04", signed: -5, receipt: "AAA0000004FEE", description: "Fuliza access fee", covers: "AAA0000004" },
      { id: 6, date: "2026-10-04", signed: -7, receipt: null, description: "M-Pesa charge", covers: "AAA0000004" },
    ];
    const result = findDifference(withFuliza, ledger, 1000)!;
    expect(result.spans.flatMap((span) => span.missing)).toEqual([]);
    expect(result.spans.flatMap((span) => span.extra)).toEqual([]);
  });

  // Spans "no single entry explains" were nearly all an M-Pesa charge never
  // saved (5 Oct 2026): the payment is there, for less than the balance moved.
  it("finds a payment saved for a different amount than the balance moved: a charge never saved", () => {
    const withCharge: DifferenceMessage[] = [
      ...messages,
      { receipt: "AAA0000004", balance: 2093, at: at("2026-10-04", 9), day: "2026-10-04" }, // paid 100, charge 7
    ];
    const ledger: LedgerEntry[] = [...right, { id: 4, date: "2026-10-04", signed: -100, receipt: "AAA0000004", description: "Airtime" }];
    const result = findDifference(withCharge, ledger, 1000)!;
    expect(result.spans).toHaveLength(1);
    expect(result.spans[0]).toMatchObject({ change: -7, missing: [], extra: [], redated: [] });
    expect(result.spans[0].amounts).toEqual([{ receipt: "AAA0000004", day: "2026-10-04", entryId: 4, description: "Airtime", inMessages: -107, inJamvi: -100 }]);

    // Saved with its charge, it agrees.
    const charged = findDifference(withCharge, [...ledger, { id: 5, date: "2026-10-04", signed: -7, receipt: null, description: "Charge", covers: "AAA0000004" }], 1000)!;
    expect(charged.spans).toEqual([]);
  });

  // "Biggest first" (5 Oct 2026): 56 days of shillings hid the few that made the gap.
  it("lists the biggest differences first, whatever their dates", () => {
    const days: DifferenceMessage[] = [
      { receipt: "BBB0000001", balance: 1000, at: at("2026-10-01", 9), day: "2026-10-01" },
      { receipt: "BBB0000002", balance: 990, at: at("2026-10-02", 9), day: "2026-10-02" },   // -10, not saved
      { receipt: "BBB0000003", balance: 5990, at: at("2026-10-03", 9), day: "2026-10-03" },  // +5,000, not saved
      { receipt: "BBB0000004", balance: 5890, at: at("2026-10-04", 9), day: "2026-10-04" },  // -100, not saved
    ];
    const result = findDifference(days, [], 1000)!;
    expect(result.spans.map((span) => span.change)).toEqual([5000, -100, -10]);
    expect(result.moreSpans).toBe(0);
  });

  it("counts days across a month end", () => {
    expect(nextDay("2026-09-30")).toBe("2026-10-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
  });
});

// "it is still taking me back and forth" (12 Oct 2026): the 30 Sep "Borrowed from Fuliza
// (still owed at the end)" was offered for removal as in none of the messages.
describe("lines the statement reader makes", () => {
  it("are known by their codes - no message ever has one", () => {
    expect(statementMade("FB260101260930")).toBe(true);
    expect(statementMade("FZ260101260930")).toBe(true);
    expect(statementMade("FR260101260930")).toBe(true);
    expect(statementMade("UIUF98FDDTC1")).toBe(true);
    expect(statementMade("UE5F937HJL")).toBe(false);
    expect(statementMade(null)).toBe(false);
  });
});

// "i have 6840" (12 Oct 2026): a Fuliza repayment no message was sent for sat between two
// messages, and the step between their balances made Tiana's 6,840 read as 9,882.
describe("a message's own amount", () => {
  const ledger = [
    { id: 1, date: "2026-03-15", signed: 10_000, description: "Salary", receipt: "UCGF99HUY4" },
    { id: 2, date: "2026-03-16", signed: -6882, description: "Tiana", receipt: "UCGF99HV23" },
  ] as LedgerEntry[];
  const messages = (moved?: number): DifferenceMessage[] => [
    { receipt: "UCGF99HUY4", balance: 10_000, at: 1, day: "2026-03-15" },
    { receipt: "UCGF99HV23", balance: 117.62, at: 2, day: "2026-03-16", ...(moved === undefined ? {} : { moved }) },
  ];
  const amounts = (moved?: number) => (findDifference(messages(moved), ledger, 0)?.spans ?? []).flatMap((span) => span.amounts ?? []);

  it("is what an entry is compared with, when the message says it", () => {
    expect(amounts(-6882)).toEqual([]);
  });

  it("without it, the step between balances is still used", () => {
    expect(amounts().map((item) => item.receipt)).toEqual(["UCGF99HV23"]);
  });
});

// Find the difference, 12 Oct 2026: Be Energy's payments (on the statement, no message
// on the phone) offered for removal, and every Fuliza-paid payment "saved for a
// different amount" by its access fee.
describe("what Find the difference no longer asks about", () => {
  it("an entry with an M-Pesa code is never offered for removal", () => {
    expect(mpesaCode("UE5F93A2VX")).toBe(true);
    expect(mpesaCode("UE5F93A2VXFEE")).toBe(false);
    expect(mpesaCode(null)).toBe(false);
    const ledger = [
      { id: 1, date: "2026-05-05", signed: 1000, description: "Salary", receipt: "UE4F930001" },
      { id: 2, date: "2026-05-06", signed: 544, description: "Received from Be Energy Ltd", receipt: "UE5F93A2VX" },
    ] as LedgerEntry[];
    const messages: DifferenceMessage[] = [
      { receipt: "UE4F930001", balance: 1000, at: 1, day: "2026-05-05" },
      { receipt: "UE6F930002", balance: 1500, at: 2, day: "2026-05-07" },
    ];
    const extra = (findDifference(messages, ledger, 0)?.spans ?? []).flatMap((span) => span.extra);
    expect(extra.map((item) => item.id)).not.toContain(2);
  });

  it("a payment's Fuliza access fee is not part of what its message moved", () => {
    const ledger = [
      { id: 1, date: "2026-05-06", signed: 2000, description: "Salary", receipt: "UE6F930001" },
      { id: 2, date: "2026-05-07", signed: -1000, description: "Airtime", receipt: "UE7F930002" },
      { id: 3, date: "2026-05-07", signed: -10, description: "Fuliza access fee", receipt: "UE7F930002FEE", covers: "UE7F930002" },
    ] as LedgerEntry[];
    const messages: DifferenceMessage[] = [
      { receipt: "UE6F930001", balance: 2000, at: 1, day: "2026-05-06" },
      { receipt: "UE7F930002", balance: 900, at: 2, day: "2026-05-07", moved: -1000 },
    ];
    const amounts = (findDifference(messages, ledger, 0)?.spans ?? []).flatMap((span) => span.amounts ?? []);
    expect(amounts).toEqual([]);
  });
});

// A church group's M-Pesa is another line: the phone's own messages laid against it said
// "Jamvi is KES 170,433 below M-Pesa" (12 Oct 2026).
describe("messages from another M-Pesa line", () => {
  const codes = Array.from({ length: 30 }, (_, i) => `UDMF91${String(i).padStart(4, "0")}`);
  it("are known when almost none of them are in the account", () => {
    expect(isAnotherLine(codes, new Set(codes.slice(0, 2)))).toBe(true);
  });
  it("not when the account has them, or there are too few to tell", () => {
    expect(isAnotherLine(codes, new Set(codes.slice(0, 20)))).toBe(false);
    expect(isAnotherLine(codes.slice(0, 5), new Set())).toBe(false);
  });
});
