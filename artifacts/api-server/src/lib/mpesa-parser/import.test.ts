import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildFormatReport, readPaste, splitMpesaMessages, toImportItem } from "./import";

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
  it("says whether the message named anybody", () => {
    expect(toImportItem(SEND_PERSON, 0).named).toBe(true);
    expect(toImportItem("TESTNONAME1 Confirmed. Ksh50.00 paid on 2/9/26 at 9:50 AM. New M-PESA balance is Ksh0.00.", 0).named).toBe(false);
  });

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

  it("reads a reversal as money back in, pointing at the payment it undid", () => {
    const item = toImportItem(REVERSAL, 0);
    expect(item).toMatchObject({ status: "ready", direction: "in", type: "reversal", amount: 1, fee: null, date: "2026-08-13", named: false });
    expect(item.receipt).toBe("TESTREVERSAL1");
    expect(item.description).toBe("Money back: reversal of TESTORIGINAL1");
  });
});

describe("toImportItem: what it will not decide for you", () => {
  it.each([
    ["cash you gave an agent", CASH_DEPOSIT],
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

describe("Fuliza notices", () => {
  const PAYMENT = "TESTFULIZA1 Confirmed. Ksh20.00 sent to SAMPLE SHOP on 24/10/26 at 9:15 AM. New M-PESA balance is Ksh0.00. Transaction cost, Ksh0.00.";
  const NOTICE = "TESTFULIZA1 Confirmed. Fuliza M-PESA amount is Ksh 25.00. Access Fee charged Ksh 0.26. Total Fuliza M-PESA outstanding amount is Ksh 25.26 due on 24/11/26.";

  const NOTICE_NO_FEE = "TESTFULIZA2 Confirmed. Fuliza M-PESA amount is Ksh 25.00. Total Fuliza M-PESA outstanding amount is Ksh 25.00 due on 24/11/26.";

  it("records only the access fee, as money out: the loan itself is not spending", () => {
    const item = toImportItem(NOTICE, 0);
    expect(item).toMatchObject({
      status: "ready", direction: "out", type: "fuliza_fee", amount: 0.26, description: "Fuliza access fee", fee: null,
    });
    expect(item.amount).not.toBe(25);
  });

  it("gives the fee its own receipt code, so it never collides with its payment's", () => {
    expect(toImportItem(NOTICE, 0).receipt).toBe("TESTFULIZA1FEE");
  });

  it("leaves a notice with no access fee out, and says why", () => {
    const item = toImportItem(NOTICE_NO_FEE, 0);
    expect(item).toMatchObject({ status: "skipped", type: "fuliza_notice", receipt: "TESTFULIZA2", amount: 25 });
    expect(item.direction).toBeNull();
    expect(item.reason).toContain("Fuliza loan notice");
  });

  it("does not disturb the payment message that shares its receipt code, and takes its date", () => {
    const items = readPaste([PAYMENT, NOTICE].join("\n"));
    expect(items.map((item) => [item.receipt, item.status, item.type])).toEqual([
      ["TESTFULIZA1", "ready", "person_payment"],
      ["TESTFULIZA1FEE", "ready", "fuliza_fee"],
    ]);
    expect(items[1].date).toBe("2026-10-24");
  });

  it("has no date when its payment was not pasted with it, rather than borrowing the due date", () => {
    expect(readPaste(NOTICE)[0].date).toBeNull();
  });

  it("stays a valid receipt code for the ledger", () => {
    const code = toImportItem(NOTICE, 0).receipt!;
    expect(code).toMatch(/^[A-Z0-9]{6,20}$/);
  });

  it("is not a repeat of its own payment, in the route", () => {
    const route = readFileSync(new URL("../../routes/mpesa-import.ts", import.meta.url), "utf8");
    expect(route).toContain('item.type !== "fuliza_notice"');
    expect(route).toContain('if (item.type === "fuliza_notice") return { ...item, alreadyRecorded: null };');
    // The fee has a receipt code of its own, so it takes part in the duplicate check like any line.
    expect(route).not.toContain('"fuliza_fee"');
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
    expect(route).toContain("You pasted this one twice");
  });

  it("neither logs nor stores what was pasted", () => {
    expect(route).not.toMatch(/console\.|logger\.|req\.log/);
    expect(route).not.toContain(".insert(");
  });
});

describe("sending a message so its format can be learned", () => {
  const NO_NAME = "TESTNONAME1 Confirmed. Ksh50.00 paid on 2/9/26 at 9:50 AM. New M-PESA balance is Ksh0.00. Sent by 0712 345 678.";

  it("masks phone numbers again and says what the parser made of the message", () => {
    const report = buildFormatReport(NO_NAME);
    expect(report).not.toContain("0712 345 678");
    expect(report).toContain("<PHONE>");
    expect(report).toContain("M-Pesa format report");
    expect(report).toContain("Parser version:");
    expect(report).toContain("Parser saw: type=");
    expect(report).toContain("counterparty=none");
  });

  it("says so when the text is not an M-Pesa message at all", () => {
    expect(buildFormatReport("Hello, see you at 5 today")).toContain("Parser saw: status=unsupported");
  });

  it("puts nothing about the sender in the relayed body", () => {
    const route = readFileSync(new URL("../../routes/mpesa-import.ts", import.meta.url), "utf8");
    expect(route).toContain('submittedBy: "mpesa-format-report"');
    expect(route).not.toContain("req.user");
    expect(route).toContain("feedbackLimiter");
    expect(route).toContain('context: "mpesa-format"');
    expect(route).not.toMatch(/console\.|logger\.|req\.log/);
  });
});

// From a real phone: M-Pesa prints the sender's number with its middle hidden,
// and the parser could not read the name in front of it.
describe("a masked phone number", () => {
  const RECEIVED =
    "TESTMASK1 Confirmed.You have received Ksh250.00 from SAMPLE PERSON 0722***443 on 21/9/26 at 4:57 PM New M-PESA balance is Ksh9,354.70. Invest & earn daily interest with ZIIDI on https://saf.cx/xxxx";

  it("no longer hides the name of who money came from", () => {
    const item = toImportItem(RECEIVED, 0);
    expect(item).toMatchObject({
      status: "ready", direction: "in", type: "person_receipt", amount: 250, date: "2026-09-21", named: true,
    });
    expect(item.description).toBe("Received from Sample Person");
  });

  it.each([
    ["stars", "0722***443"],
    ["plus signs, as some copies show them", "0722+++443"],
    ["crosses", "0722xxx443"],
    ["an international masked number", "+254722***443"],
  ])("reads %s", (_name, masked) => {
    const item = toImportItem(RECEIVED.replace("0722***443", masked), 0);
    expect(item.named).toBe(true);
    expect(item.description).toBe("Received from Sample Person");
  });

  it("reads a payment to a person whose number is masked", () => {
    const item = toImportItem(
      "TESTMASK2 Confirmed. Ksh70.00 sent to SAMPLE PERSON 0722***443 on 2/9/26 at 9:50 AM. New M-PESA balance is Ksh0.00. Transaction cost, Ksh0.00.",
      0,
    );
    expect(item).toMatchObject({ status: "ready", direction: "out", type: "person_payment", named: true });
    expect(item.description).toBe("Sample Person");
  });

  it("is masked out of a report before anyone reads it", () => {
    const report = buildFormatReport(RECEIVED);
    expect(report).not.toContain("0722***443");
    expect(report).toContain("<PHONE>");
  });
});

describe("sending a report when the CRM is not set up", () => {
  const route = readFileSync(new URL("../../routes/mpesa-import.ts", import.meta.url), "utf8");

  it("falls back to an email to the Jamvi inbox, and says so only when neither is set up", () => {
    expect(route).toContain("await sendToCrm(report)");
    expect(route).toContain("await sendByEmail(report)");
    expect(route).toContain('to: [process.env.MPESA_REPORT_TO?.trim() || "info@jamvi.co.ke"]');
    expect(route).toContain('if (emailed === "not-configured")');
    expect(route).toContain("Sending is not set up yet.");
  });

  it("escapes the message in the email and adds nothing about who sent it", () => {
    expect(route).toContain("escapeHtml(report)");
    expect(route).toContain('.replace(/</g, "&lt;")');
    expect(route).not.toContain("req.user");
    expect(route).not.toMatch(/console\.|logger\.|req\.log/);
  });
});
