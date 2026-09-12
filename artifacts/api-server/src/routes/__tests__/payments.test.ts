/**
 * M-Pesa payment reconciliation.
 *
 * Written after a real incident: a member was genuinely charged, but the
 * status-poll misread Daraja's 4999 ("still under processing") as a hard
 * failure, which then caused the real success callback — which arrived
 * seconds later — to be silently discarded, because the callback only ever
 * updates a payment still sitting at PENDING. The two properties that matter
 * are exactly the two this got wrong:
 *
 *  - only a short, well-understood set of Daraja codes may ever mark a
 *    payment FAILED; anything ambiguous is left PENDING rather than guessed
 *    at, since PENDING can still self-heal and FAILED cannot;
 *  - a confirmed success (resultCode 0) is trusted the moment we see it,
 *    from either the poll or the callback, instead of only ever trusting one
 *    of the two paths.
 */

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  selectRows,
  updateSet,
  queryStkStatus,
  readCallback,
  activateSubscription,
  recordRedemption,
} = vi.hoisted(() => ({
  selectRows: { current: [] as unknown[] },
  updateSet: vi.fn((_values: Record<string, unknown>) => undefined),
  queryStkStatus: vi.fn(async (_checkoutRequestId: string) => ({ resultCode: 0, resultDesc: "" })),
  readCallback: vi.fn((_body: unknown): unknown => null),
  activateSubscription: vi.fn(async (_params: Record<string, unknown>) => undefined),
  recordRedemption: vi.fn(async (_code: string, _tx: unknown) => undefined),
}));

function makeQueryable() {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(selectRows.current),
          for: () => ({ limit: () => Promise.resolve(selectRows.current) }),
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updateSet(values);
        return { where: () => Promise.resolve() };
      },
    }),
  };
}

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    db: {
      ...makeQueryable(),
      transaction: async (cb: (tx: ReturnType<typeof makeQueryable>) => Promise<void>) => cb(makeQueryable()),
    },
  };
});

vi.mock("../../lib/mpesa", () => ({
  isMpesaConfigured: vi.fn(() => true),
  missingMpesaSettings: vi.fn(() => [] as string[]),
  normalizeMsisdn: vi.fn((value: string) => value),
  sendStkPush: vi.fn(async () => ({ merchantRequestId: "m", checkoutRequestId: "c", customerMessage: "" })),
  queryStkStatus,
  readCallback,
}));

vi.mock("../../lib/subscription-billing", () => ({
  activateSubscription,
  recordRedemption,
  resolvePrice: vi.fn(async () => ({ amountKes: 100, promoCode: null })),
}));

import { paymentsRouter, publicPaymentsRouter } from "../payments";

const logMock = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

function appForPayments() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { log: unknown }).log = logMock;
    (req as unknown as { user?: { id: string } }).user = { id: "user-1" };
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    next();
  });
  app.use("/api", paymentsRouter);
  app.use("/api", publicPaymentsRouter);
  return app;
}

function pendingPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 21,
    userId: "user-1",
    status: "pending",
    checkoutRequestId: "ws_CO_x",
    billingInterval: "monthly",
    amountKes: 100,
    promoCode: null,
    mpesaReceiptNumber: null,
    resultDesc: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  selectRows.current = [];
});

describe("GET /api/payments/:id/status", () => {
  it("activates the subscription the moment Safaricom confirms success, without waiting for the callback", async () => {
    selectRows.current = [pendingPayment()];
    queryStkStatus.mockResolvedValue({ resultCode: 0, resultDesc: "The service request is processed successfully." });

    const response = await request(appForPayments()).get("/api/payments/21/status");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("succeeded");
    expect(activateSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", interval: "monthly", promoCode: null }),
    );
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: "succeeded" }));
  });

  it("leaves the payment pending on an inconclusive code (4999), instead of marking it failed", async () => {
    selectRows.current = [pendingPayment({ id: 22 })];
    queryStkStatus.mockResolvedValue({ resultCode: 4999, resultDesc: "The transaction is still under processing" });

    const response = await request(appForPayments()).get("/api/payments/22/status");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("pending");
    expect(updateSet).not.toHaveBeenCalled();
    expect(activateSubscription).not.toHaveBeenCalled();
  });

  it("marks failed only for a recognised terminal code, such as the member cancelling", async () => {
    selectRows.current = [pendingPayment({ id: 23 })];
    queryStkStatus.mockResolvedValue({ resultCode: 1032, resultDesc: "Request cancelled by user" });

    const response = await request(appForPayments()).get("/api/payments/23/status");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("failed");
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", resultCode: 1032 }));
  });

  it("leaves an already-settled payment alone and never re-queries Safaricom", async () => {
    selectRows.current = [pendingPayment({ id: 24, status: "succeeded" })];

    const response = await request(appForPayments()).get("/api/payments/24/status");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("succeeded");
    expect(queryStkStatus).not.toHaveBeenCalled();
  });
});

describe("POST /api/mpesa/callback", () => {
  it("activates the subscription on a genuine success callback for a still-pending payment", async () => {
    selectRows.current = [pendingPayment({ id: 25 })];
    readCallback.mockReturnValue({
      checkoutRequestId: "ws_CO_x",
      merchantRequestId: "m1",
      resultCode: 0,
      resultDesc: "The service request is processed successfully.",
      mpesaReceiptNumber: "SFA999",
      amountKes: 100,
      phoneNumber: "254700000000",
    });

    const response = await request(appForPayments()).post("/api/mpesa/callback").send({ Body: {} });

    expect(response.status).toBe(200);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "succeeded", mpesaReceiptNumber: "SFA999" }),
    );
    expect(activateSubscription).toHaveBeenCalled();
  });

  it("discards a callback for a payment no longer pending, and logs what it said", async () => {
    // The exact shape of the incident: a payment wrongly marked FAILED by the
    // status poll, then the real callback lands moments later.
    selectRows.current = [pendingPayment({ id: 21, status: "failed" })];
    readCallback.mockReturnValue({
      checkoutRequestId: "ws_CO_x",
      merchantRequestId: "m1",
      resultCode: 0,
      resultDesc: "The service request is processed successfully.",
      mpesaReceiptNumber: "SFA123",
      amountKes: 100,
      phoneNumber: "254700000000",
    });

    const response = await request(appForPayments()).post("/api/mpesa/callback").send({ Body: {} });

    expect(response.status).toBe(200);
    expect(updateSet).not.toHaveBeenCalled();
    expect(activateSubscription).not.toHaveBeenCalled();
    expect(logMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 21, existingStatus: "failed", callbackResultCode: 0, callbackReceipt: "SFA123" }),
      expect.stringContaining("Discarded"),
    );
  });

  it("discards a callback that names no payment we issued", async () => {
    selectRows.current = [];
    readCallback.mockReturnValue({
      checkoutRequestId: "ws_CO_unknown",
      merchantRequestId: "m1",
      resultCode: 0,
      resultDesc: "ok",
      mpesaReceiptNumber: "SFA000",
      amountKes: 100,
      phoneNumber: "254700000000",
    });

    const response = await request(appForPayments()).post("/api/mpesa/callback").send({ Body: {} });

    expect(response.status).toBe(200);
    expect(updateSet).not.toHaveBeenCalled();
  });
});
