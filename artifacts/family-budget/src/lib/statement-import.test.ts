import { describe, expect, it } from "vitest";
import { reconcile, statementLines } from "./statement-import";
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

  it("does not name the person for airtime, and names cash withdrawals", () => {
    const { lines } = statementLines([
      at("01 08:00:00", "Customer Bundle Purchase to 2547***000 - SAMPLE PERSON by 2547***111", { withdrawn: 20 }),
      at("01 09:00:00", "Customer Withdrawal at Agent Till to 555 - SAMPLE AGENT", { withdrawn: 300 }),
    ]);
    expect(lines[0]).toMatchObject({ type: "airtime_purchase", description: "Airtime", named: false });
    expect(lines[1]).toMatchObject({ type: "cash_withdrawal", description: "Cash withdrawal — Sample Agent" });
  });

  it("leaves out what it does not recognise, with a reason, rather than guessing", () => {
    const { lines } = statementLines([
      at("01 08:00:00", "Something Never Seen Before", { withdrawn: 5 }),
      at("01 09:00:00", "Pay Utility Reversal by Lipa na Sample", { paidIn: 5 }),
    ]);
    expect(lines.map((line) => line.status)).toEqual(["skipped", "skipped"]);
    expect(lines[0].reason).toContain("not recognised");
    expect(lines[1].reason).toContain("came back");
  });

  it("does not fold a charge when there is no single payment for it", () => {
    const { lines } = statementLines([at("01 08:00:00", "Pay Bill Charge", { withdrawn: 5 })]);
    expect(lines[0]).toMatchObject({ status: "skipped" });
    expect(lines[0].reason).toContain("bank charge");
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
    expect(result.savedChange).toBe(195);
    expect(result.gap).toBe(20);
    expect(result.parts.map((part) => part.amount)).toEqual([-100, 100, 20]);
    expect(result.parts.reduce((sum, part) => sum + part.amount, 0)).toBe(result.gap);
  });

  it("counts what is not ticked as part of the difference", () => {
    const reading = statementLines(statement());
    const result = reconcile(reading, (line) => line.direction === "in")!;
    const unticked = result.parts.find((part) => part.label.includes("not ticked"));
    expect(unticked?.amount).toBe(-305);
    expect(result.parts.reduce((sum, part) => sum + part.amount, 0)).toBe(result.gap);
  });

  it("has nothing to say when the balances cannot be worked out", () => {
    expect(reconcile({ ...statementLines([]), opening: null }, () => true)).toBeNull();
  });
});
