import { describe, expect, it } from "vitest";
import { normalizeMpesaMessage } from "./normalize";
import { parseMpesaMessage } from "./parser";

describe("M-Pesa parser foundation", () => {
  it("rejects an empty message without inventing a transaction", () => {
    expect(parseMpesaMessage("   ")).toMatchObject({
      status: "invalid",
      transaction: null,
      confidence: "none",
    });
  });

  it("marks unrelated text as unsupported", () => {
    expect(parseMpesaMessage("Meeting moved to tomorrow afternoon.")).toMatchObject({
      status: "unsupported",
      transaction: null,
      confidence: "none",
    });
  });

  it("normalizes whitespace and redacts Kenyan phone numbers", () => {
    expect(normalizeMpesaMessage("  M-PESA\r\n  sent to 0712 345 678  ")).toBe(
      "M-PESA\nsent to <PHONE>",
    );
  });

  it("extracts only fields present in a generic anonymized confirmation", () => {
    const result = parseMpesaMessage(
      "TEST1234 Confirmed. Ksh1,250.00 paid to SAMPLE MARKET on 01/09/2026 at 18:42. New M-PESA balance is Ksh8,450.00. Transaction cost, Ksh0.00.",
    );

    expect(result.status).toBe("parsed");
    expect(result.confidence).toBe("high");
    expect(result.transaction).toMatchObject({
      transactionId: "TEST1234",
      transactionType: "merchant_payment",
      purchaseCategory: null,
      amount: 1250,
      currency: "KES",
      merchantOrCounterparty: "SAMPLE MARKET",
      date: "2026-09-01",
      time: "18:42",
      mpesaBalance: 8450,
      fee: 0,
      phoneNumber: null,
    });
  });

  it("returns warnings and nulls when expected fields are missing", () => {
    const result = parseMpesaMessage("M-PESA payment notification.");
    expect(result.status).toBe("parsed");
    expect(result.confidence).toBe("none");
    expect(result.transaction?.transactionId).toBeNull();
    expect(result.transaction?.amount).toBeNull();
    expect(result.warnings).toContain("Transaction ID was not found.");
  });

  it("does not accept zero as a transaction amount", () => {
    const result = parseMpesaMessage("TEST1234 Confirmed. Ksh0.00 paid to SAMPLE SHOP.");
    expect(result.transaction?.amount).toBeNull();
    expect(result.warnings).toContain("A positive KSh amount was not found.");
  });

  it.each([
    {
      name: "standard postpaid bundle wording",
      message:
        "TESTAIR1 Confirmed. Ksh20.00 sent to SAMPLE POSTPAID BUNDLES for account SAMPLE DATA DAILY on 31/8/26 at 9:08 PM. New M-PESA balance is Ksh12,024.59. Transaction cost, Ksh0.00.",
      transactionId: "TESTAIR1",
      date: "2026-08-31",
      time: "21:08",
      balance: 12024.59,
    },
    {
      name: "postpaid bundle with appended account notices",
      message:
        "TESTAIR2 Confirmed. Ksh20.00 sent to SAMPLE POSTPAID BUNDLES for account SAMPLE DATA DAILY on 30/8/26 at 3:16 PM New M-PESA balance is Ksh0.00. Transaction cost, Ksh0.00.Amount you can transact within the day is 499,555.00. See all your balances now <LINK>",
      transactionId: "TESTAIR2",
      date: "2026-08-30",
      time: "15:16",
      balance: 0,
    },
    {
      name: "postpaid bundle with a different offer",
      message:
        "TESTAIR3 Confirmed. Ksh30.00 sent to SAMPLE POSTPAID BUNDLES for account SAMPLE MIDNIGHT OFFERS on 1/9/26 at 11:08 AM. New M-PESA balance is Ksh2,436.27. Transaction cost, Ksh0.00.",
      transactionId: "TESTAIR3",
      date: "2026-09-01",
      time: "11:08",
      balance: 2436.27,
    },
  ])("recognizes $name as a postpaid bundle purchase", ({ message, transactionId, date, time, balance }) => {
    const result = parseMpesaMessage(message);

    expect(result).toMatchObject({
      status: "parsed",
      confidence: "high",
      transaction: {
        transactionId,
        transactionType: "airtime_purchase",
        purchaseCategory: "postpaid_bundle",
        amount: expect.any(Number),
        currency: "KES",
        merchantOrCounterparty: "SAMPLE POSTPAID BUNDLES",
        date,
        time,
        mpesaBalance: balance,
        fee: 0,
      },
    });
  });

  it.each([
    {
      name: "Tunukiwa minutes offer",
      message:
        "TESTMIN1 Confirmed. Ksh20.00 sent to Safaricom Offers for account Tunukiwa on 2/9/26 at 9:18 AM. New M-PESA balance is Ksh65.27. Transaction cost, Ksh0.00.",
      transactionId: "TESTMIN1",
      merchant: "Safaricom Offers",
      date: "2026-09-02",
      time: "09:18",
      amount: 20,
      balance: 65.27,
    },
    {
      name: "Tunukiwa minutes offer with a different amount",
      message:
        "TESTMIN2 Confirmed. Ksh53.00 sent to Safaricom Offers for account Tunukiwa on 4/3/26 at 6:11 PM. New M-PESA balance is Ksh8,071.87. Transaction cost, Ksh0.00.",
      transactionId: "TESTMIN2",
      merchant: "Safaricom Offers",
      date: "2026-03-04",
      time: "18:11",
      amount: 53,
      balance: 8071.87,
    },
    {
      name: "Talkmore minutes offer labelled as data bundles",
      message:
        "TESTMIN3 Confirmed. Ksh200.00 sent to SAFARICOM DATA BUNDLES for account Talkmore on 30/8/26 at 8:38 AM. New M-PESA balance is Ksh2,180.73. Transaction cost, Ksh0.00.",
      transactionId: "TESTMIN3",
      merchant: "SAFARICOM DATA BUNDLES",
      date: "2026-08-30",
      time: "08:38",
      amount: 200,
      balance: 2180.73,
    },
  ])("recognizes $name as a minutes purchase", ({ message, transactionId, merchant, date, time, amount, balance }) => {
    const result = parseMpesaMessage(message);

    expect(result).toMatchObject({
      status: "parsed",
      confidence: "high",
      transaction: {
        transactionId,
        transactionType: "airtime_purchase",
        purchaseCategory: "minutes",
        amount,
        currency: "KES",
        merchantOrCounterparty: merchant,
        date,
        time,
        mpesaBalance: balance,
        fee: 0,
      },
    });
  });

  it.each([
    {
      name: "direct pay airtime confirmation",
      message:
        "TESTAIRTIME1 Confirmed. Ksh23.00 sent to DIRECT PAY 04 for account SAMPLE ACCOUNT on 31/8/26 at 5:57 PM New M-PESA balance is Ksh0.00. Transaction cost, Ksh0.00.Amount you can transact within the day is 499,806.00. See all your balances now <LINK>",
      transactionId: "TESTAIRTIME1",
      merchant: "DIRECT PAY 04",
      date: "2026-08-31",
      time: "17:57",
      amount: 23,
      balance: 0,
    },
    {
      name: "explicit airtime purchase",
      message:
        "TESTAIRTIME2 confirmed.You bought Ksh20.00 of airtime on 13/3/26 at 9:18 PM.New M-PESA balance is Ksh0.00. Transaction cost, Ksh0.00. Amount you can transact within the day is 499,009.00. Start Investing today with Ziidi MMF & earn daily. Dial *334#.",
      transactionId: "TESTAIRTIME2",
      merchant: null,
      date: "2026-03-13",
      time: "21:18",
      amount: 20,
      balance: 0,
    },
    {
      name: "explicit airtime purchase with a different amount",
      message:
        "TESTAIRTIME3 confirmed.You bought Ksh10.00 of airtime on 20/3/26 at 2:34 PM.New M-PESA balance is Ksh0.00. Transaction cost, Ksh0.00. Amount you can transact within the day is 499,806.00. Start Investing today with Ziidi MMF & earn daily. Dial *334#.",
      transactionId: "TESTAIRTIME3",
      merchant: null,
      date: "2026-03-20",
      time: "14:34",
      amount: 10,
      balance: 0,
    },
  ])("recognizes $name as a regular airtime purchase", ({ message, transactionId, merchant, date, time, amount, balance }) => {
    const result = parseMpesaMessage(message);

    expect(result).toMatchObject({
      status: "parsed",
      confidence: "high",
      transaction: {
        transactionId,
        transactionType: "airtime_purchase",
        purchaseCategory: "airtime",
        amount,
        currency: "KES",
        merchantOrCounterparty: merchant,
        date,
        time,
        mpesaBalance: balance,
        fee: 0,
      },
    });
  });

  it.each([
    {
      name: "home internet payment without a space in provider name",
      message:
        "TESTWIFI1 Confirmed. Ksh1,500.00 sent to SAFARICOMHOME for account SAMPLE ACCOUNT on 1/9/26 at 11:15 PM. New M-PESA balance is Ksh200.27. Transaction cost, Ksh0.00.",
      transactionId: "TESTWIFI1",
      merchant: "SAFARICOMHOME",
      date: "2026-09-01",
      time: "23:15",
      amount: 1500,
      balance: 200.27,
    },
    {
      name: "home internet payment with a space in provider name",
      message:
        "TESTWIFI2 Confirmed. Ksh2,999.00 sent to SAFARICOMHOME for account SAMPLE ACCOUNT on 4/3/26 at 5:50 PM. New M-PESA balance is Ksh8,124.87. Transaction cost, Ksh0.00.",
      transactionId: "TESTWIFI2",
      merchant: "SAFARICOMHOME",
      date: "2026-03-04",
      time: "17:50",
      amount: 2999,
      balance: 8124.87,
    },
    {
      name: "home internet payment with appended account notices",
      message:
        "TESTWIFI3 Confirmed. Ksh2,999.00 sent to Safaricom Home for account SAMPLE ACCOUNT on 3/4/26 at 6:47 PM New M-PESA balance is Ksh0.00. Transaction cost, Ksh0.00.Amount you can transact within the day is 487,771.00. Save frequent paybills for quick payment on M-PESA app <LINK>",
      transactionId: "TESTWIFI3",
      merchant: "Safaricom Home",
      date: "2026-04-03",
      time: "18:47",
      amount: 2999,
      balance: 0,
    },
  ])("recognizes $name as a Wi-Fi purchase", ({ message, transactionId, merchant, date, time, amount, balance }) => {
    const result = parseMpesaMessage(message);

    expect(result).toMatchObject({
      status: "parsed",
      confidence: "high",
      transaction: {
        transactionId,
        transactionType: "airtime_purchase",
        purchaseCategory: "wifi",
        amount,
        currency: "KES",
        merchantOrCounterparty: merchant,
        date,
        time,
        mpesaBalance: balance,
        fee: 0,
      },
    });
  });

  it.each([
    {
      name: "sent to a person with a phone number",
      message:
        "TESTSEND1 Confirmed. Ksh70.00 sent to SAMPLE PERSON <PHONE> on 2/9/26 at 9:50 AM. New M-PESA balance is Ksh0.00. Transaction cost, Ksh0.00. Amount you can transact within the day is 499,890.00. See all your balances now <LINK>",
      transactionId: "TESTSEND1",
      recipient: "SAMPLE PERSON",
      date: "2026-09-02",
      time: "09:50",
      amount: 70,
      balance: 0,
      fee: 0,
    },
    {
      name: "sent to a person with a non-zero fee",
      message:
        "TESTSEND2 Confirmed. Ksh150.00 sent to SAMPLE PERSON <PHONE> on 1/9/26 at 6:51 PM. New M-PESA balance is Ksh7,082.59. Transaction cost, Ksh7.00. Amount you can transact within the day is 491,650.00. See all your balances now <LINK>",
      transactionId: "TESTSEND2",
      recipient: "SAMPLE PERSON",
      date: "2026-09-01",
      time: "18:51",
      amount: 150,
      balance: 7082.59,
      fee: 7,
    },
    {
      name: "paid to a full personal name",
      message:
        "TESTSEND3 Confirmed. Ksh120.00 paid to SAMPLE PERSON FULL NAME. on 30/10/25 at 6:01 PM.New M-PESA balance is Ksh248.18. Transaction cost, Ksh0.00. Amount you can transact within the day is 485,865.00. Save frequent Tills for quick payment on M-PESA app <LINK>",
      transactionId: "TESTSEND3",
      recipient: "SAMPLE PERSON FULL NAME",
      date: "2025-10-30",
      time: "18:01",
      amount: 120,
      balance: 248.18,
      fee: 0,
    },
  ])("recognizes $name as a person-to-person payment", ({ message, transactionId, recipient, date, time, amount, balance, fee }) => {
    const result = parseMpesaMessage(message);

    expect(result).toMatchObject({
      status: "parsed",
      confidence: "high",
      transaction: {
        transactionId,
        transactionType: "person_payment",
        purchaseCategory: null,
        amount,
        currency: "KES",
        merchantOrCounterparty: recipient,
        date,
        time,
        mpesaBalance: balance,
        fee,
      },
    });
  });

  it.each([
    {
      name: "received payment with no fee line",
      message:
        "TESTRECEIVE1 Confirmed.You have received Ksh1,000.00 from SAMPLE PERSON <PHONE> on 21/10/25 at 9:24 PM  New M-PESA balance is Ksh1,000.00. Earn interest daily on Ziidi MMF,Dial *334#",
      transactionId: "TESTRECEIVE1",
      sender: "SAMPLE PERSON",
      date: "2025-10-21",
      time: "21:24",
      amount: 1000,
      balance: 1000,
    },
    {
      name: "received payment with a larger amount",
      message:
        "TESTRECEIVE2 Confirmed.You have received Ksh3,500.00 from SAMPLE PERSON <PHONE> on 22/10/25 at 3:31 PM  New M-PESA balance is Ksh3,500.00. Earn interest daily on Ziidi MMF,Dial *334#",
      transactionId: "TESTRECEIVE2",
      sender: "SAMPLE PERSON",
      date: "2025-10-22",
      time: "15:31",
      amount: 3500,
      balance: 3500,
    },
    {
      name: "received payment with a different amount and date",
      message:
        "TESTRECEIVE3 Confirmed.You have received Ksh35,000.00 from SAMPLE PERSON <PHONE> on 31/10/25 at 5:37 PM  New M-PESA balance is Ksh35,000.00. Earn interest daily on Ziidi MMF,Dial *334#",
      transactionId: "TESTRECEIVE3",
      sender: "SAMPLE PERSON",
      date: "2025-10-31",
      time: "17:37",
      amount: 35000,
      balance: 35000,
    },
  ])("recognizes $name as an incoming person-to-person payment", ({ message, transactionId, sender, date, time, amount, balance }) => {
    const result = parseMpesaMessage(message);

    expect(result).toMatchObject({
      status: "parsed",
      confidence: "high",
      transaction: {
        transactionId,
        transactionType: "person_receipt",
        purchaseCategory: null,
        amount,
        currency: "KES",
        merchantOrCounterparty: sender,
        date,
        time,
        mpesaBalance: balance,
        fee: null,
      },
    });
  });

  it.each([
    {
      name: "mall merchant payment with Till notice",
      message:
        "TESTMERCHANT1 Confirmed. Ksh12,696.00 paid to SAMPLE SPUR MALL. on 31/10/25 at 7:20 PM.New M-PESA balance is Ksh21,679.71. Transaction cost, Ksh0.00. Amount you can transact within the day is 486,124.00. Save frequent Tills for quick payment on M-PESA app <LINK>",
      transactionId: "TESTMERCHANT1",
      merchant: "SAMPLE SPUR MALL",
      date: "2025-10-31",
      time: "19:20",
      amount: 12696,
      balance: 21679.71,
    },
    {
      name: "express merchant payment",
      message:
        "TESTMERCHANT2 Confirmed. Ksh4,264.00 paid to SAMPLE MEMBLEY EXPRESS. on 24/8/26 at 6:33 PM.New M-PESA balance is Ksh17,861.58. Transaction cost, Ksh0.00. Amount you can transact within the day is 382,804.00. Download My OneApp on <LINK>",
      transactionId: "TESTMERCHANT2",
      merchant: "SAMPLE MEMBLEY EXPRESS",
      date: "2026-08-24",
      time: "18:33",
      amount: 4264,
      balance: 17861.58,
    },
    {
      name: "supermarket merchant payment",
      message:
        "TESTMERCHANT3 Confirmed. Ksh3,000.00 paid to SAMPLE SUPERMARKET. on 13/7/26 at 1:37 PM.New M-PESA balance is Ksh206.52. Transaction cost, Ksh0.00. Amount you can transact within the day is 498,110.00. Download My OneApp on <LINK>",
      transactionId: "TESTMERCHANT3",
      merchant: "SAMPLE SUPERMARKET",
      date: "2026-07-13",
      time: "13:37",
      amount: 3000,
      balance: 206.52,
    },
  ])("recognizes $name as a merchant payment", ({ message, transactionId, merchant, date, time, amount, balance }) => {
    const result = parseMpesaMessage(message);

    expect(result).toMatchObject({
      status: "parsed",
      confidence: "high",
      transaction: {
        transactionId,
        transactionType: "merchant_payment",
        purchaseCategory: null,
        amount,
        currency: "KES",
        merchantOrCounterparty: merchant,
        date,
        time,
        mpesaBalance: balance,
        fee: 0,
      },
    });
  });
});