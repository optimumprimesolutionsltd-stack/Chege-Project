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
});