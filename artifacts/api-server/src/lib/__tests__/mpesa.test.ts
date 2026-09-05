/**
 * The pure parts of the Daraja integration.
 *
 * Two of these guard money rather than tidiness. readCallback is fed a payload
 * from a public, unsigned endpoint, so it has to survive anything; and the
 * timestamp is part of the request password, so a wrong clock rejects every
 * payment with an error that does not say which field was wrong.
 */

import { describe, expect, it } from "vitest";
import { darajaTimestamp, normalizeMsisdn, readCallback } from "../mpesa";

describe("normalizeMsisdn", () => {
  it("accepts the shapes people actually type", () => {
    for (const input of [
      "0712345678",
      "712345678",
      "254712345678",
      "+254 712 345 678",
      "0712 345 678",
    ]) {
      expect(normalizeMsisdn(input)).toBe("254712345678");
    }
  });

  it("handles Airtel and Safaricom prefixes alike", () => {
    expect(normalizeMsisdn("0112345678")).toBe("254112345678");
  });

  it("refuses what Daraja would reject anyway, with wording a person can act on", () => {
    for (const input of ["", "12345", "07123456789", "abc"]) {
      expect(() => normalizeMsisdn(input)).toThrow(/Safaricom number/);
    }
  });
});

describe("darajaTimestamp", () => {
  it("is Nairobi time, not the server's", () => {
    // Render runs in UTC. The timestamp goes into the password hash, so a UTC
    // clock makes every request malformed.
    expect(darajaTimestamp(new Date("2026-09-05T09:30:15Z"))).toBe("20260905123015");
  });

  it("rolls into the next day where Nairobi already has", () => {
    expect(darajaTimestamp(new Date("2026-09-05T22:10:00Z"))).toBe("20260906011000");
  });
});

describe("readCallback", () => {
  const success = {
    Body: {
      stkCallback: {
        MerchantRequestID: "29115-34620561-1",
        CheckoutRequestID: "ws_CO_191220191020363925",
        ResultCode: 0,
        ResultDesc: "The service request is processed successfully.",
        CallbackMetadata: {
          Item: [
            { Name: "Amount", Value: 100 },
            { Name: "MpesaReceiptNumber", Value: "NLJ7RT61SV" },
            { Name: "PhoneNumber", Value: 254712345678 },
          ],
        },
      },
    },
  };

  it("reads a successful payment", () => {
    const facts = readCallback(success);

    expect(facts).not.toBeNull();
    expect(facts!.checkoutRequestId).toBe("ws_CO_191220191020363925");
    expect(facts!.resultCode).toBe(0);
    expect(facts!.mpesaReceiptNumber).toBe("NLJ7RT61SV");
    expect(facts!.amountKes).toBe(100);
    expect(facts!.phoneNumber).toBe("254712345678");
  });

  it("reads a cancellation, which carries no metadata at all", () => {
    const facts = readCallback({
      Body: {
        stkCallback: {
          MerchantRequestID: "29115-34620561-1",
          CheckoutRequestID: "ws_CO_cancelled",
          ResultCode: 1032,
          ResultDesc: "Request cancelled by user",
        },
      },
    });

    expect(facts!.resultCode).toBe(1032);
    expect(facts!.mpesaReceiptNumber).toBeNull();
    expect(facts!.amountKes).toBeNull();
  });

  it("returns null for anything it cannot make sense of", () => {
    // The endpoint is public and unsigned, so this is reachable by anyone.
    // Returning null is what keeps a malformed post from being treated as a
    // payment.
    for (const payload of [
      null,
      undefined,
      "",
      42,
      {},
      { Body: {} },
      { Body: { stkCallback: {} } },
      { Body: { stkCallback: { CheckoutRequestID: "" } } },
      { Body: { stkCallback: { CheckoutRequestID: 12345 } } },
    ]) {
      expect(readCallback(payload)).toBeNull();
    }
  });

  it("survives metadata that is the wrong shape", () => {
    const facts = readCallback({
      Body: {
        stkCallback: {
          CheckoutRequestID: "ws_CO_odd",
          ResultCode: 0,
          CallbackMetadata: { Item: "not an array" },
        },
      },
    });

    expect(facts).not.toBeNull();
    expect(facts!.mpesaReceiptNumber).toBeNull();
  });

  it("does not accept a receipt that is not a string", () => {
    // A number here would be written into the column support reads back to
    // members, so it is dropped rather than coerced.
    const facts = readCallback({
      Body: {
        stkCallback: {
          CheckoutRequestID: "ws_CO_weird",
          ResultCode: 0,
          CallbackMetadata: { Item: [{ Name: "MpesaReceiptNumber", Value: { nested: true } }] },
        },
      },
    });

    expect(facts!.mpesaReceiptNumber).toBeNull();
  });
});
