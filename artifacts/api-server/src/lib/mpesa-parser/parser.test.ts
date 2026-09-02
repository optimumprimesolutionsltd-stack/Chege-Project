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
});