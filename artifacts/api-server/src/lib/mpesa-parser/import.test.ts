import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readPaste, splitMpesaMessages, toImportItem } from "./import";

// The anonymized examples the parser was built against (see parser.test.ts).
const SEND_PERSON =
  "TESTSEND1 Confirmed. Ksh70.00 sent to SAMPLE PERSON <PHONE> on 2/9/26 at 9:50 AM. New M-PESA balance is Ksh0.00. Transaction cost, Ksh0.00. Amount you can transact within the day is 499,890.00. See all your balances now <LINK>";
const MERCHANT =
  "TESTMERCHANT3 Confirmed. Ksh3,000.00 paid to SAMPLE SUPERMARKET. on 13/7/26 at 1:37 PM.New M-PESA balance is Ksh206.52. Transaction cost, Ksh0.00. Amount you can transact within the day is 498,110.00. Download My OneApp on <LINK>";
const PAYBILL =
  "TESTPAYBILL1 Confirmed. Ksh3,000.00 sent to SAMPLE PAYBILL ACCOUNT for account SAMPLE ACCOUNT on 1/9/26 at 1:49 PM New M-PESA balance is Ksh9,474.59. Transaction cost, Ksh25.00.Amount you can transact within the day is 494,000.00. See all your balances now <LINK>";
const RECEIVE =
  "TESTRECEIVE2 Confirmed.You have received Ksh3,500.00 from SAMPLE PERSON <PHONE> on 22/10/25 at 3:31 PM  New M-PESA balance is Ksh3,500.00. Earn interest daily on Ziidi MMF,Dial *334#";
const WITHDRAW =
  "TESTWITHDRAW1 Confirmed.on 30/8/26 at 10:12 AMWithdraw Ksh800.00 from SAMPLE AGENT CODE - SAMPLE MARKET CENTRE New M-PESA balance is Ksh1,351.73. Transaction cost, Ksh29.00. Amount you can transact within the day is 499,000.00.";
const AIRTIME =
  "TESTAIRTIME3 confirmed.You bought Ksh10.00 of airtime on 20/3/26 at 2:34 PM.New M-PESA balance is Ksh0.00. Transaction cost, Ksh0.00. Amount you can transact within the day is 499,806.00.";
const CASH_DEPOSIT =
  "TESTDEPOSIT2 Confirmed. On 28/8/26 at 6:30 PM Give Ksh500.00 cash to SAMPLE AGENT - SAMPLE LOCATION New M-PESA balance is Ksh500.00. You can now access M-PESA via *334#";
const REVERSAL =
  "TESTREVERSAL1 confirmed. Reversal of transaction TESTORIGINAL1 has been successfully reversed on 13/8/26 at 11:00 AM and Ksh1.00 is credited to your M-PESA account. New M-PESA account balance is Ksh1.00.";

describe("splitMpesaMessages", () => {
  it("splits a paste into one string per message, however they are separated", () => {
    const paste = [SEND_PERSON, MERCHANT, RECEIVE].join("\n\n");
    expect(splitMpesaMessages(paste)).toEqual([SEND_PERSON, MERCHANT, RECEIVE]);
    expect(splitMpesaMessages([SEND_PERSON, MERCHANT].join(" "))).toHaveLength(2);
    expect(splitMpesaMessages([SEND_PERSON, MERCHANT].join("\r\n"))).toHaveLength(2);
  });

  it("keeps a single pasted message whole", () => {
    expect(splitMpesaMessages(PAYBILL)).toEqual([PAYBILL]);
  });

  it("does not split at an ordinary word before 'confirmed'", () => {
    const message = "TESTSEND1 Confirmed. Ksh70.00 sent to SAMPLE on 2/9/26. Your booking is Confirmed by the hotel.";
    expect(splitMpesaMessages(message)).toHaveLength(1);
  });

  it("returns nothing for empty text and caps how many it will read", () => {
    expect(splitMpesaMessages("   \n ")).toEqual([]);
    const many = Array.from({ length: 300 }, (_, i) => `TESTSEND${i + 1000} Confirmed. Ksh1.00 sent to X on 2/9/26.`).join("\n");
    expect(splitMpesaMessages(many)).toHaveLength(200);
  });
});

describe("toImportItem: money out", () => {
  it("reads a payment to a person", () => {
    expect(toImportItem(SEND_PERSON, 0)).toMatchObject({
      status: "ready", direction: "out", type: "person_payment", receipt: "TESTSEND1",
      amount: 70, date: "2026-09-02", fee: null,
    });
  });

  it("reads a merchant payment and names it in plain capitals", () => {
    const item = toImportItem(MERCHANT, 1);
    expect(item).toMatchObject({ status: "ready", direction: "out", type: "merchant_payment", amount: 3000, date: "2026-07-13" });
    expect(item.description).toBe("Sample Supermarket");
  });

  it("keeps a paybill's account and reads its transaction cost as a separate fee", () => {
    const item = toImportItem(PAYBILL, 2);
    expect(item).toMatchObject({ status: "ready", direction: "out", type: "paybill_payment", amount: 3000, fee: 25 });
    expect(item.description).toBe("Sample Paybill Account (Sample Account)");
  });

  it("reads a withdrawal with its fee", () => {
    const item = toImportItem(WITHDRAW, 3);
    expect(item).toMatchObject({ status: "ready", direction: "out", type: "cash_withdrawal", amount: 800, fee: 29, date: "2026-08-30" });
    expect(item.description).toContain("Cash withdrawal");
  });

  it("reads an airtime purchase", () => {
    expect(toImportItem(AIRTIME, 4)).toMatchObject({ status: "ready", direction: "out", type: "airtime_purchase", amount: 10, date: "2026-03-20" });
  });
});

describe("toImportItem: money in", () => {
  it("reads money received, with no fee", () => {
    const item = toImportItem(RECEIVE, 0);
    expect(item).toMatchObject({ status: "ready", direction: "in", type: "person_receipt", amount: 3500, fee: null, date: "2025-10-22" });
    expect(item.description).toBe("Received from Sample Person");
  });
});

describe("toImportItem: what it will not decide for you", () => {
  it.each([
    ["cash you gave an agent", CASH_DEPOSIT],
    ["a reversal", REVERSAL],
  ])("skips %s and says why, keeping what it read", (_name, message) => {
    const item = toImportItem(message, 0);
    expect(item.status).toBe("skipped");
    expect(item.reason).toBeTruthy();
    expect(item.direction).toBeNull();
    expect(item.receipt).toBeTruthy();
  });

  it("skips text that is not an M-Pesa message and one with no amount", () => {
    expect(toImportItem("Hello, see you at 5", 0)).toMatchObject({ status: "skipped", receipt: null });
    expect(toImportItem("TESTSEND9 Confirmed. sent to SAMPLE on 2/9/26.", 1).status).toBe("skipped");
  });
});

describe("readPaste", () => {
  it("keeps the order, and one bad message does not lose the others", () => {
    const items = readPaste([SEND_PERSON, "garbage line", RECEIVE, CASH_DEPOSIT].join("\n"));
    // "garbage line" has no receipt code, so it rides along with the message before it.
    expect(items.map((item) => item.receipt)).toEqual(["TESTSEND1", "TESTRECEIVE2", "TESTDEPOSIT2"]);
    expect(items.map((item) => item.status)).toEqual(["ready", "ready", "skipped"]);
    expect(items.map((item) => item.index)).toEqual([0, 1, 2]);
  });
});

describe("the preview route", () => {
  const route = readFileSync(new URL("../../routes/mpesa-import.ts", import.meta.url), "utf8");
  const index = readFileSync(new URL("../../routes/index.ts", import.meta.url), "utf8");

  it("sits behind the member check, after the gate that keeps viewers out of writes", () => {
    expect(index.indexOf("router.use(mpesaImportRouter);")).toBeGreaterThan(index.indexOf("router.use(requireMember);"));
  });

  it("marks what this budget already holds, by receipt, within this budget only", () => {
    expect(route).toContain("eq(jointAccountTxTable.groupId, groupId)");
    expect(route).toContain("inArray(jointAccountTxTable.mpesaReceipt, receipts)");
    expect(route).toContain("The same message appears twice");
  });

  it("neither logs nor stores what was pasted", () => {
    expect(route).not.toMatch(/console\.|logger\.|req\.log/);
    expect(route).not.toContain(".insert(");
  });
});
