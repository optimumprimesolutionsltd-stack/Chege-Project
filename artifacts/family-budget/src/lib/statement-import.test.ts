import { describe, expect, it } from "vitest";
import { balanceAtEndOf, dayBefore, fulizaOwedBefore, missingInJamvi, notOnStatement, reconcile, statementLines, withoutRecordedFuliza } from "./statement-import";
import type { StatementRow } from "./statement-table";

let n = 0;
const at = (time: string, details: string, over: Partial<StatementRow> = {}): StatementRow => ({
  receipt: `TEST${String((n += 1)).padStart(6, "0")}`,
  time: `2026-09-${time}`,
  details,
  status: "Completed",
  paidIn: null,
  withdrawn: null,
  balance: 0,
  ...over,
});

describe("statementLines", () => {
  it("reads a payment and folds its charge into the fee", () => {
    const charge = at("02 09:00:00", "Customer Transfer of Funds Charge", { withdrawn: 7 });
    const payment = { ...at("02 09:00:00", "Customer Transfer to - 2547***000 SAMPLE PERSON", { withdrawn: 93 }), receipt: charge.receipt };
    const { lines } = statementLines([charge, payment]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      status: "ready",
      direction: "out",
      type: "person_payment",
      amount: 93,
      fee: 7,
      date: "2026-09-02",
      description: "Sample Person",
      named: true,
    });
  });

  it("puts the oldest first even when the statement lists the newest first", () => {
    const newer = at("03 10:00:00", "Merchant Payment Online to 123456 - SAMPLE SHOP", { withdrawn: 10 });
    const older = at("01 10:00:00", "Funds received from - 2547***000 SAMPLE PERSON", { paidIn: 50 });
    const { lines } = statementLines([newer, older]);
    expect(lines.map((line) => line.date)).toEqual(["2026-09-01", "2026-09-03"]);
    expect(lines[0]).toMatchObject({ direction: "in", type: "person_receipt", description: "Received from Sample Person" });
  });

  it("records what a Fuliza loan paid for as ordinary spending, and leaves out the loan itself", () => {
    const draw = at("05 12:00:00", "OverDraft of Credit Party", { paidIn: 200 });
    const payment = { ...at("05 12:00:00", "Pay Bill Online Fuliza M-Pesa to 123456 - SAMPLE UTILITY Acc. 42", { withdrawn: 200 }), receipt: draw.receipt };
    const repay = at("06 12:00:00", "OD Loan Repayment to 999999 - M-PESA Overdraw", { withdrawn: 200 });
    const reading = statementLines([repay, payment, draw]);
    expect(reading.loanDraws).toBe(1);
    expect(reading.loanRepayments).toBe(1);
    expect(reading.lines).toHaveLength(1);
    expect(reading.lines[0]).toMatchObject({ type: "paybill_payment", amount: 200, description: "Sample Utility (42)" });
  });

  it("reads a payment to a small business (Pochi la Biashara) as a payment to them", () => {
    const { lines } = statementLines([
      at("27 08:00:00", "Customer Payment to Small Business to - 0743***708 SAMPLE SHOP", { withdrawn: 100 }),
    ]);
    expect(lines[0]).toMatchObject({ direction: "out", type: "person_payment", amount: 100, description: "Sample Shop" });
  });

  it("does not name the person for airtime, and names cash withdrawals", () => {
    const { lines } = statementLines([
      at("01 08:00:00", "Customer Bundle Purchase to 2547***000 - SAMPLE PERSON by 2547***111", { withdrawn: 20 }),
      at("01 09:00:00", "Customer Withdrawal at Agent Till to 555 - SAMPLE AGENT", { withdrawn: 300 }),
    ]);
    expect(lines[0]).toMatchObject({ type: "airtime_purchase", description: "Airtime", named: false });
    expect(lines[1]).toMatchObject({ type: "cash_withdrawal", description: "Cash withdrawal — Sample Agent" });
  });

  // Everything a full statement moved becomes an entry: set aside, it left the
  // account short of the statement with nothing on screen to say why.
  it("lists what it does not recognise, in the words of the statement, for a category to be chosen", () => {
    const { lines } = statementLines([
      at("01 08:00:00", "Something Never Seen Before", { withdrawn: 5 }),
      at("01 09:00:00", "Pay Utility Reversal by Lipa na Sample", { withdrawn: 5 }),
    ]);
    expect(lines.map((line) => [line.status, line.type, line.direction, line.description])).toEqual([
      ["ready", "other", "out", "Something Never Seen Before"],
      ["ready", "other", "out", "Pay Utility Reversal by Lipa na Sample"],
    ]);
  });

  it("records a reversal that put money back as money in", () => {
    const { lines } = statementLines([at("01 09:00:00", "Pay Utility Reversal by Lipa na Sample", { paidIn: 5 })]);
    expect(lines[0]).toMatchObject({ status: "ready", direction: "in", type: "reversal", amount: 5, description: "Money back: a reversed payment", named: false });
  });

  it("lists a charge with no single payment for it as a charge of its own", () => {
    const row = at("01 08:00:00", "Pay Bill Charge", { withdrawn: 5 });
    const { lines, leftOutNet } = statementLines([row]);
    expect(lines[0]).toMatchObject({ status: "ready", type: "transaction_charge", direction: "out", amount: 5, description: "M-Pesa charge" });
    expect(leftOutNet).toBe(0);
  });

  it("gives such a charge its own receipt, so saving the payment beside it cannot hide it", () => {
    const row = at("01 08:00:00", "Pay Bill Charge", { withdrawn: 5 });
    const { lines } = statementLines([row]);
    expect(lines[0].receipt).toBe(`${row.receipt}C1`);
    expect(lines[0].receipt).toMatch(/^[A-Z0-9]{8,15}$/);
  });

  it("lists what Fuliza cost - repaid above drawn - as one line for the statement", () => {
    const draw = at("01 08:00:00", "OverDraft of Credit Party", { paidIn: 100 });
    const repay = at("03 08:00:00", "OD Loan Repayment to 999999 - M-PESA Overdraw", { withdrawn: 104.5 });
    const { lines } = statementLines([repay, draw]);
    const fee = lines.find((line) => line.type === "fuliza_fee")!;
    expect(fee).toMatchObject({ status: "ready", direction: "out", amount: 4.5 });
    expect(fee.receipt).toMatch(/^FZ[0-9]{12}$/);
  });

  it("lists no Fuliza line when no more was repaid than drawn", () => {
    const draw = at("01 08:00:00", "OverDraft of Credit Party", { paidIn: 100 });
    const repay = at("03 08:00:00", "OD Loan Repayment to 999999 - M-PESA Overdraw", { withdrawn: 100 });
    expect(statementLines([repay, draw]).lines.some((line) => line.type === "fuliza_fee")).toBe(false);
  });
});

describe("reconcile", () => {
  // Opening 1,000. +500 received; a Fuliza-funded payment of 300 with a 5 charge and a 100 loan draw;
  // a 100 loan repayment; a 20 reversal. Closing 1,215.
  const statement = () => {
    const received = at("01 08:00:00", "Funds received from - 2547***000 SAMPLE PERSON", { paidIn: 500, balance: 1500 });
    const draw = at("02 08:00:00", "OverDraft of Credit Party", { paidIn: 100, balance: 1295 });
    const payment = { ...at("02 08:00:00", "Pay Bill Online Fuliza M-Pesa to 123456 - SAMPLE UTILITY", { withdrawn: 300, balance: 1200 }), receipt: draw.receipt };
    const charge = { ...at("02 08:00:00", "Pay Bill Charge", { withdrawn: 5, balance: 1195 }), receipt: draw.receipt };
    const repay = at("03 08:00:00", "OD Loan Repayment to 999999 - M-PESA Overdraw", { withdrawn: 100, balance: 1195 - 100 + 100 });
    const reversal = at("04 08:00:00", "Pay Utility Reversal by Lipa na Sample", { paidIn: 20, balance: 1215 });
    return [reversal, repay, charge, payment, draw, received];
  };

  it("finds the opening and closing balance", () => {
    const reading = statementLines(statement());
    expect(reading.opening).toBe(1000);
    expect(reading.closing).toBe(1215);
  });

  it("says what is left out and that the parts add up to the difference", () => {
    const reading = statementLines(statement());
    const result = reconcile(reading, () => true)!;
    expect(result.statementChange).toBe(215);
    // The reversal is recorded as money back in, so only the Fuliza loans and repayments differ, and they cancel here.
    expect(result.savedChange).toBe(215);
    expect(result.gap).toBe(0);
    // Drawn and repaid cancel here, so there is nothing left to explain.
    expect(result.parts).toEqual([]);
  });

  it("counts what is not ticked as part of the difference", () => {
    const reading = statementLines(statement());
    const result = reconcile(reading, (line) => line.direction === "in")!;
    const unticked = result.parts.find((part) => part.label.includes("not ticked"));
    expect(unticked?.amount).toBe(-305);
    expect(result.parts.reduce((sum, part) => sum + part.amount, 0)).toBe(result.gap);
  });

  it("counts what the account already has as matched, not as a difference", () => {
    const reading = statementLines(statement());
    const earlier = reading.lines.map((line) => (line.direction === "in" && line.amount === 500 ? { ...line, alreadyRecorded: { date: "2026-09-01", description: "Saved" } } : line));
    const result = reconcile({ ...reading, lines: earlier }, (line) => !line.alreadyRecorded)!;
    expect(result.alreadyRecordedChange).toBe(500);
    expect(result.savedChange).toBe(-285);
    expect(result.gap).toBe(0);
    expect(result.parts.find((part) => part.label.includes("not ticked"))).toBeUndefined();
  });

  it("explains a Fuliza loan still open at the end as borrowed, not as fees", () => {
    const received = at("01 08:00:00", "Funds received from - 2547***000 SAMPLE PERSON", { paidIn: 500, balance: 1500 });
    const draw = at("02 08:00:00", "OverDraft of Credit Party", { paidIn: 80, balance: 1580 });
    const reading = statementLines([draw, received]);
    const result = reconcile(reading, () => true)!;
    expect(reading.lines.some((line) => line.type === "fuliza_fee")).toBe(false);
    // Listed as borrowed, so saving it leaves the account where M-Pesa's balance is.
    expect(reading.lines.find((line) => line.type === "fuliza_borrowed")).toMatchObject({ direction: "in", amount: 80 });
    expect(result.parts).toEqual([]);
    expect(result.gap).toBe(0);
  });

  // September's statement: loans repaid with their fees until the 26th, then more
  // drawn and still owed. Counting that last loan hid the fees, and the balance was off by both.
  it("splits Fuliza into the fees on repaid loans and what is still owed", () => {
    const received = at("01 08:00:00", "Funds received from - 2547***000 SAMPLE PERSON", { paidIn: 1000, balance: 1000 });
    const draw = at("02 08:00:00", "OverDraft of Credit Party", { paidIn: 500, balance: 1500 });
    const repay = at("10 08:00:00", "OD Loan Repayment to 999999 - M-PESA Overdraw", { withdrawn: 506, balance: 994 });
    const later = at("27 08:00:00", "OverDraft of Credit Party", { paidIn: 800, balance: 1794 });
    const reading = statementLines([later, repay, draw, received]);
    expect(reading.lines.find((line) => line.type === "fuliza_fee")).toMatchObject({ direction: "out", amount: 6 });
    const owed = reading.lines.find((line) => line.type === "fuliza_borrowed")!;
    expect(owed).toMatchObject({ direction: "in", amount: 800, date: "2026-09-27" });
    expect(owed.receipt).toMatch(/^FB[0-9]{12}$/);
    expect(reading.loanLeftOut).toBe(0);
  });

  it("counts a balance an earlier statement left owed as repaid, not as fees", () => {
    const received = at("01 08:00:00", "Funds received from - 2547***000 SAMPLE PERSON", { paidIn: 1000, balance: 1000 });
    const repay = at("01 08:00:01", "OD Loan Repayment to 999999 - M-PESA Overdraw", { withdrawn: 300, balance: 700 });
    const reading = statementLines([repay, received], { amount: 300, receipt: "FB260801260831" });
    expect(reading.lines.some((line) => line.type === "fuliza_fee")).toBe(false);
    expect(reading.lines.find((line) => line.type === "fuliza_repaid")).toMatchObject({ direction: "out", amount: 300, receipt: "FR260801260831" });
    expect(reconcile(reading, () => true)!.gap).toBe(0);
  });

  it("has nothing to say when the balances cannot be worked out", () => {
    expect(reconcile({ ...statementLines([]), opening: null }, () => true)).toBeNull();
  });
});

describe("Fuliza owed from an earlier statement", () => {
  const recorded = [
    { mpesaReceipt: "FB260701260731", amount: 200 },
    { mpesaReceipt: "FB260801260831", amount: "3178.08" },
    { mpesaReceipt: "UIRF981AVM", amount: 100 },
  ];
  it("is the latest borrowed line that ended before this statement", () => {
    expect(fulizaOwedBefore("2026-09-01", recorded)).toEqual({ amount: 3178.08, receipt: "FB260801260831" });
  });
  it("is nothing once its repayment is recorded, or for the same statement read again", () => {
    expect(fulizaOwedBefore("2026-09-01", [...recorded, { mpesaReceipt: "FR260801260831", amount: 3178.08 }])).toEqual({ amount: 200, receipt: "FB260701260731" });
    expect(fulizaOwedBefore("2026-08-01", recorded.slice(1))).toBeNull();
  });
});

describe("till and paybill numbers", () => {
  it("are read from a statement row, and only for shops and bills, never a person or airtime", () => {
    const { lines } = statementLines([
      at("01 08:00:00", "Merchant Payment Online to 123456 - SAMPLE SHOP", { withdrawn: 100 }),
      at("01 09:00:00", "Pay Bill Online to 654321 - SAMPLE UTILITY Acc. 42", { withdrawn: 50 }),
      at("01 10:00:00", "Customer Transfer to - 2547***000 SAMPLE PERSON", { withdrawn: 30 }),
      at("01 11:00:00", "Customer Bundle Purchase to 2547***000 - SAMPLE PERSON by 2547***111", { withdrawn: 20 }),
    ]);
    expect(lines.map((line) => line.payeeNumber)).toEqual(["123456", "654321", null, null]);
  });
});


// "Why is the M-Pesa statement not aligning?" - Jamvi's balance the day
// before the statement, beside M-Pesa's opening, says whether the difference
// is from before it.
describe("Jamvi's balance on a day", () => {
  const rows = [
    { date: "2026-08-30", type: "deposit", amount: 1000 },
    { date: "2026-08-31T00:00:00.000Z", type: "disbursement", amount: "336.75" },
    { date: "2026-09-02", type: "disbursement", amount: 500 },
  ];
  it("is the starting balance plus everything up to the end of that day", () => {
    expect(balanceAtEndOf("2026-08-31", 11000, rows)).toBe(11663.25);
    expect(balanceAtEndOf("2026-09-29", 11000, rows)).toBe(11163.25);
    expect(balanceAtEndOf("2026-08-01", 11000, rows)).toBe(11000);
  });
  it("is asked for the day before the statement starts", () => {
    expect(dayBefore("2026-09-01")).toBe("2026-08-31");
    expect(dayBefore("2026-03-01")).toBe("2026-02-28");
  });
});

// "I still can't match the closing balance": what the account has that the
// statement does not is what leaves it off.
describe("entries in Jamvi but not on the statement", () => {
  const reading = { ...statementLines([at("02 08:00:00", "Pay Bill Online to 123456 - SAMPLE UTILITY", { withdrawn: 300, receipt: "ABC1234567" })]), firstDate: "2026-09-01", lastDate: "2026-09-29" };
  const rows = [
    { id: 1, date: "2026-09-02", type: "disbursement", amount: 300, description: "Sample Utility", mpesaReceipt: "ABC1234567" },
    { id: 2, date: "2026-09-05", type: "disbursement", amount: 500, description: "Typed in", mpesaReceipt: null },
    { id: 3, date: "2026-09-02", type: "disbursement", amount: 7, description: "Bank charge", chargeForTransactionId: 1 },
    { id: 4, date: "2026-09-02", type: "disbursement", amount: 7, description: "M-Pesa charge", mpesaReceipt: "ABC1234567C1" },
    { id: 5, date: "2026-08-31", type: "disbursement", amount: 900, description: "Before the statement" },
    { id: 6, date: "2026-09-10", type: "deposit", amount: 200, description: "Pasted", mpesaReceipt: "ZZZ9999999" },
  ];
  it("lists them with why, and adds up what they do to the balance", () => {
    const { rows: found, net } = notOnStatement(reading, rows);
    expect(found.map((row) => row.id)).toEqual([2, 4, 6]);
    expect(net).toBe(-500 - 7 + 200);
  });

  it("names the kept-with-payment charge as the twice-counted one when the statement lists the charge on its own", () => {
    const lone = { ...reading, lines: [...reading.lines, { ...reading.lines[0], index: 9, receipt: "ABC1234567C1", type: "transaction_charge", amount: 7 }] };
    const { rows: found } = notOnStatement(lone, rows);
    expect(found.map((row) => row.id)).toEqual([2, 3, 6]);
    expect(found.find((row) => row.id === 3)?.why).toMatch(/twice/);
  });
});

// A 1-30 September statement after a 1-29 one: Fuliza charges 720.24 and still
// owed 3,305.07, of which 688.25 and 3,178.08 were already recorded.
describe("Fuliza from overlapping statements", () => {
  const base = { ...statementLines([]), opening: 100, closing: 100, firstDate: "2026-09-01", lastDate: "2026-09-30" };
  const fuliza = (index: number, type: string, direction: "in" | "out", amount: number, receipt: string) => ({
    index, status: "ready" as const, reason: null, receipt, direction, type, amount, description: type, named: false, date: "2026-09-30", fee: null, mpesaBalance: null, alreadyRecorded: null,
  });
  const reading = { ...base, lines: [fuliza(0, "fuliza_fee", "out", 720.24, "FZ260901260930"), fuliza(1, "fuliza_borrowed", "in", 3305.07, "FB260901260930")] };
  const recorded = [
    { id: 1, date: "2026-09-29", type: "disbursement", amount: 688.25, mpesaReceipt: "FZ260901260929" },
    { id: 2, date: "2026-09-29", type: "deposit", amount: 3178.08, mpesaReceipt: "FB260901260929" },
    { id: 3, date: "2026-08-31", type: "deposit", amount: 500, mpesaReceipt: "FB260801260831" },
  ];

  it("adds only what the earlier statement did not already record", () => {
    const adjusted = withoutRecordedFuliza(reading, recorded);
    expect(adjusted.lines[0]).toMatchObject({ amount: 31.99, status: "ready" });
    expect(adjusted.lines[1]).toMatchObject({ amount: 126.99, status: "ready" });
    expect(adjusted.fulizaAlreadyRecorded).toBe(3178.08 - 688.25);
  });

  it("leaves a line out when the earlier statement already covers all of it", () => {
    const same = withoutRecordedFuliza({ ...reading, lines: [fuliza(0, "fuliza_fee", "out", 688.25, "FZ260901260930")] }, recorded);
    expect(same.lines[0]).toMatchObject({ status: "skipped", direction: null });
  });

  it("keeps the balance check whole", () => {
    const adjusted = withoutRecordedFuliza(reading, recorded);
    const check = reconcile(adjusted, () => true)!;
    expect(check.alreadyRecordedChange).toBe(round2(3178.08 - 688.25));
  });
});
const round2 = (value: number) => Math.round(value * 100) / 100;

// "Can the app fix these itself?" Only what it can prove is a duplicate.
describe("fixing what is not on the statement", () => {
  const line = (index: number, type: string, direction: "in" | "out", amount: number, receipt: string) => ({
    index, status: "ready" as const, reason: null, receipt, direction, type, amount, description: type, named: false, date: "2026-09-30", fee: null, mpesaBalance: null, alreadyRecorded: null,
  });
  const reading = {
    ...statementLines([]), opening: 12024.59, closing: 0, firstDate: "2026-09-01", lastDate: "2026-09-30",
    lines: [line(0, "fuliza_fee", "out", 720.24, "FZ260901260930"), line(1, "fuliza_borrowed", "in", 3305.07, "FB260901260930")],
  };
  const recorded = [
    { id: 1, date: "2026-09-30", type: "disbursement", amount: 720.24, description: "Fuliza charges 2026-09-01 to 2026-09-30", mpesaReceipt: "FZ260901260930" },
    { id: 2, date: "2026-09-30", type: "deposit", amount: 3305.07, description: "Borrowed from Fuliza", mpesaReceipt: "FB260901260930" },
    { id: 3, date: "2026-09-29", type: "disbursement", amount: 0.2, description: "Fuliza access fee", mpesaReceipt: "TJT1234ABCFEE" },
    { id: 4, date: "2026-09-29", type: "disbursement", amount: 32.66, description: "Fuliza access fee", mpesaReceipt: "TJT1234ABDFEE" },
    { id: 5, date: "2026-09-27", type: "disbursement", amount: 688.25, description: "Fuliza charges 2026-09-01 to 2026-09-27", mpesaReceipt: "FZ260901260927" },
    { id: 6, date: "2026-09-12", type: "disbursement", amount: 500, description: "Typed in" },
  ];

  it("marks the duplicates it can prove, and leaves the rest to decide", () => {
    const { rows } = notOnStatement(reading, recorded);
    expect(rows.filter((row) => row.fixable).map((row) => row.id)).toEqual([3, 4, 5]);
    expect(rows.find((row) => row.id === 6)?.fixable).toBe(false);
  });

  it("keeps an earlier statement\u2019s Fuliza line when only the difference was saved from this one", () => {
    const difference = recorded.map((row) => (row.id === 1 ? { ...row, amount: 31.99, description: "Fuliza charges 2026-09-01 to 2026-09-30 (less KES 688.25 already recorded)" } : row));
    const { rows } = notOnStatement(reading, difference);
    // Part of the total this statement's line was cut by: never offered for
    // deletion, and not listed as an extra either.
    expect(rows.find((row) => row.id === 5)).toBeUndefined();
  });

  // January to September read after September was imported: September"s Fuliza
  // lines are dated the statement's last day, and were listed as "In Jamvi but
  // not on this statement" although this statement's own lines were cut by them.
  it("does not list an earlier statement’s Fuliza lines that this one was cut by", () => {
    const year = {
      ...statementLines([]), opening: 6573.99, closing: 0, firstDate: "2026-01-01", lastDate: "2026-09-30",
      lines: [
        line(0, "fuliza_fee", "out", 4000, "FZ260101260930"),
        { ...line(1, "fuliza_borrowed", "in", 2474.13, "FB260101260930"), status: "skipped" as const, direction: null },
      ],
    };
    const september = [
      { id: 11, date: "2026-09-30", type: "deposit", amount: 2474.13, description: "Borrowed from Fuliza (still owed at the end)", mpesaReceipt: "FB260901260930" },
      { id: 12, date: "2026-09-30", type: "disbursement", amount: 753.3, description: "Fuliza charges 2026-09-01 to 2026-09-30", mpesaReceipt: "FZ260901260930" },
    ];
    expect(notOnStatement(year, september).rows).toEqual([]);
  });
});

// "The balance now shows 25": a payment saved without its 25 charge.
describe("what the statement has that Jamvi is missing", () => {
  const payment = (index: number, receipt: string, amount: number, fee: number | null, date: string) => ({
    index, status: "ready" as const, reason: null, receipt, direction: "out" as const, type: "paybill_payment", amount, description: "Equity Paybill Account", named: true, date, fee, mpesaBalance: null, alreadyRecorded: null,
  });
  const reading = {
    ...statementLines([]), opening: 100, closing: 0, firstDate: "2026-09-01", lastDate: "2026-09-30",
    lines: [payment(0, "UI1F94WB63", 3000, 25, "2026-09-01"), payment(1, "UI9F95TPXW", 3200, 25, "2026-09-09"), payment(2, "UISF9861HA", 3000, 25, "2026-09-28"), payment(3, "UIXXXXXXXX", 500, null, "2026-09-29")],
  };
  const rows = [
    { id: 10, date: "2026-09-01", type: "disbursement", amount: 3000, description: "Equity Paybill Account", mpesaReceipt: "UI1F94WB63" },
    { id: 11, date: "2026-09-01", type: "disbursement", amount: 25, description: "Bank charge — Equity Paybill Account", chargeForTransactionId: 10 },
    { id: 12, date: "2026-09-09", type: "disbursement", amount: 3200, description: "Equity Paybill Account", mpesaReceipt: "UI9F95TPXW" },
    { id: 13, date: "2026-09-28", type: "disbursement", amount: 3000, description: "Equity Paybill Account", mpesaReceipt: "UISF9861HA" },
    { id: 14, date: "2026-09-28", type: "disbursement", amount: 25, description: "Bank charge — Equity Paybill Account" },
    { id: 15, date: "2026-09-29", type: "disbursement", amount: 450, description: "Sample", mpesaReceipt: "UIXXXXXXXX" },
  ];

  it("finds a payment saved without its charge, and not one whose charge is there unlinked", () => {
    const { charges, net } = missingInJamvi(reading, rows);
    expect(charges).toEqual([{ parentId: 12, date: "2026-09-09", amount: 25, description: "Bank charge — Equity Paybill Account" }]);
    expect(net).toBe(-25);
  });

  it("says when a payment was saved for a different amount", () => {
    expect(missingInJamvi(reading, rows).amounts).toEqual([{ id: 15, date: "2026-09-29", description: "Sample", recorded: 450, statement: 500, fixable: false }]);
  });

  // "Saved as KES 3,355, the statement says KES 25 - Use KES 25" (6 Oct 2026).
  it("never offers a charge amount for the payment that shares its code", () => {
    const payment = { ...at("03 10:00:00", "Pay Bill to 522522 - Lipa Na Kcb Acc. 1234", { withdrawn: 3355 }), receipt: "TJ3ABCDEFG" };
    const charge = { ...at("03 10:00:00", "Pay Bill Charge Online", { withdrawn: 25 }), receipt: "TJ3ABCDEFG" };
    const saved = [{ id: 40, date: "2026-09-03", type: "disbursement", amount: 3355, description: "Lipa Na Kcb", mpesaReceipt: "TJ3ABCDEFG" }];
    const read = statementLines([payment, charge]);
    expect(read.lines).toHaveLength(1);
    expect(read.lines[0]).toMatchObject({ amount: 3355, fee: 25 });
    const found = missingInJamvi(read, saved);
    expect(found.amounts).toEqual([]);
    expect(found.charges).toEqual([{ parentId: 40, date: "2026-09-03", amount: 25, description: "Bank charge — Lipa Na Kcb" }]);
  });
});

// "Why does this keep happening?" A statement stops at the hour it was made.
describe("the last day of a statement", () => {
  const fee = (index: number, amount: number, receipt: string) => ({
    index, status: "ready" as const, reason: null, receipt, direction: "out" as const, type: "fuliza_fee", amount, description: "Fuliza charges", named: false, date: "2026-09-30", fee: null, mpesaBalance: null, alreadyRecorded: null,
  });
  const reading = { ...statementLines([]), opening: 12024.59, closing: 0, firstDate: "2026-09-01", lastDate: "2026-09-30", lines: [fee(0, 720.24, "FZ260901260930")] };

  it("never offers to remove a fee from that day, which may be after the statement was made", () => {
    const recorded = [
      { id: 1, date: "2026-09-30", type: "disbursement", amount: 720.24, description: "Fuliza charges", mpesaReceipt: "FZ260901260930" },
      { id: 2, date: "2026-09-30", type: "disbursement", amount: 20.33, description: "Fuliza access fee", mpesaReceipt: "TJU1234ABCFEE" },
    ];
    const found = notOnStatement(reading, recorded).rows.find((row) => row.id === 2)!;
    expect(found.fixable).toBe(false);
    expect(found.why).toMatch(/after it was made/);
  });

  it("takes pasted Fuliza fees from earlier days off the Fuliza charges line, so they are never counted twice", () => {
    const recorded = [
      { id: 3, date: "2026-09-12", type: "disbursement", amount: 32.66, description: "Fuliza access fee", mpesaReceipt: "TIC1234ABCFEE" },
      { id: 4, date: "2026-09-30", type: "disbursement", amount: 20.33, description: "Fuliza access fee", mpesaReceipt: "TJU1234ABCFEE" },
    ];
    const adjusted = withoutRecordedFuliza(reading, recorded);
    expect(adjusted.lines[0]).toMatchObject({ amount: 687.58, status: "ready" });
    expect(notOnStatement(adjusted, recorded).rows.find((row) => row.id === 3)).toBeUndefined();
  });
});

// A later download of the same days: its Fuliza figures have grown.
describe("Fuliza lines from an earlier download of the same statement", () => {
  it("are offered to be brought up to this statement", () => {
    const line = { index: 0, status: "ready" as const, reason: null, receipt: "FZ260901260930", direction: "out" as const, type: "fuliza_fee", amount: 741.5, description: "Fuliza charges", named: false, date: "2026-09-30", fee: null, mpesaBalance: null, alreadyRecorded: null };
    const reading = { ...statementLines([]), opening: 1, closing: 0, firstDate: "2026-09-01", lastDate: "2026-09-30", lines: [line] };
    const rows = [{ id: 1, date: "2026-09-30", type: "disbursement", amount: 720.24, description: "Fuliza charges", mpesaReceipt: "FZ260901260930" }];
    expect(missingInJamvi(reading, rows).amounts).toEqual([{ id: 1, date: "2026-09-30", description: "Fuliza charges", recorded: 720.24, statement: 741.5, fixable: true }]);
  });
});

// Safaricom printed 86 then 0 mid-way through a reversal, where the balance was
// really 80 throughout - the amounts are right. The statement check passes it,
// so the opening and closing must come through too: without them a full year's
// statement showed no balance check and no "Start this account at" offer.
describe("opening and closing across a misprinted balance", () => {
  const base: StatementRow = { receipt: "", time: "", details: "", status: "Completed", paidIn: null, withdrawn: null, balance: 0 };
  const misprinted: StatementRow[] = [
    { ...base, receipt: "TEST000006", time: "2026-05-30 16:10:00", details: "Customer Transfer to - 0700***000 SAMPLE", withdrawn: 0, balance: 0 },
    { ...base, receipt: "TEST000005", time: "2026-05-30 15:56:15", details: "Send Money Reversal via API to - 0700***001 SAMPLE", withdrawn: 80, balance: 0 },
    { ...base, receipt: "TEST000004", time: "2026-05-30 15:54:33", details: "Customer Bundle Purchase with Fuliza to 000000 SAMPLE", withdrawn: 86, balance: 0 },
    { ...base, receipt: "TEST000004", time: "2026-05-30 15:54:33", details: "OverDraft of Credit Party", paidIn: 86, balance: 86 },
    { ...base, receipt: "TEST000003", time: "2026-05-30 15:27:08", details: "Funds received from - 0700***001 SAMPLE", paidIn: 80, balance: 80 },
    { ...base, receipt: "TEST000002", time: "2026-05-30 11:12:18", details: "Customer Transfer of Funds Charge", withdrawn: 7, balance: 0 },
    { ...base, receipt: "TEST000001", time: "2026-05-30 09:00:00", details: "Funds received from - 0700***002 SAMPLE", paidIn: 7, balance: 7 },
  ];

  it("carries the balance the amounts give across the misprint", () => {
    expect(statementLines(misprinted)).toMatchObject({ opening: 0, closing: 0 });
  });

  it("still reads a clean statement from its printed balances", () => {
    const clean = misprinted.map((row) => (row.receipt === "TEST000004" ? { ...row, balance: 80 } : row));
    expect(statementLines(clean)).toMatchObject({ opening: 0, closing: 0 });
  });
});
