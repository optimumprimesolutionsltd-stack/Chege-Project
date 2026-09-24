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
import { resetRateLimits } from "../../middlewares/rateLimit";

const {
  selectRows,
  updateSet,
  insertValues,
  insertedPayment,
  queryStkStatus,
  readCallback,
  sendStkPush,
  activateSubscription,
  recordRedemption,
} = vi.hoisted(() => ({
  // `current` is the default every select resolves to; `queue` lets a test
  // give successive select calls (e.g. the payment lookup, then a later
  // currentPeriodEndFor lookup) different rows without them colliding.
  selectRows: { current: [] as unknown[], queue: [] as unknown[][] },
  updateSet: vi.fn((_values: Record<string, unknown>) => undefined),
  insertValues: vi.fn((_values: Record<string, unknown>) => undefined),
  insertedPayment: { current: { id: 99 } as { id: number } },
  queryStkStatus: vi.fn(async (_checkoutRequestId: string) => ({ resultCode: 0, resultDesc: "" })),
  readCallback: vi.fn((_body: unknown): unknown => null),
  sendStkPush: vi.fn(async (_params: Record<string, unknown>) => ({ merchantRequestId: "m", checkoutRequestId: "c", customerMessage: "Check your phone." })),
  activateSubscription: vi.fn(async (_params: Record<string, unknown>) => undefined),
  recordRedemption: vi.fn(async (_code: string, _tx: unknown) => undefined),
}));

function nextSelectResult(): unknown[] {
  return selectRows.queue.length > 0 ? selectRows.queue.shift()! : selectRows.current;
}

function makeQueryable() {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(nextSelectResult()),
          for: () => ({ limit: () => Promise.resolve(nextSelectResult()) }),
          orderBy: () => ({ limit: () => Promise.resolve(nextSelectResult()) }),
        }),
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        insertValues(values);
        return { returning: () => Promise.resolve([insertedPayment.current]) };
      },
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
  sendStkPush,
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
  selectRows.queue = [];
  insertedPayment.current = { id: 99 };
  // stk-push now sits behind real rate limiters (not mocked - the point is
  // to exercise the actual wiring); its counters are process-global and
  // would otherwise leak between these tests.
  resetRateLimits();
});

describe("POST /api/payments/stk-push", () => {
  const body = { billingInterval: "monthly", phoneNumber: "254700000000" };

  it("refuses a second push while a prompt sent moments ago is still pending", async () => {
    selectRows.current = [pendingPayment({ id: 30, createdAt: new Date() })];

    const response = await request(appForPayments()).post("/api/payments/stk-push").send(body);

    expect(response.status).toBe(409);
    expect(response.body.paymentId).toBe(30);
    expect(sendStkPush).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("starts a new push when there is nothing pending", async () => {
    selectRows.current = [];

    const response = await request(appForPayments()).post("/api/payments/stk-push").send(body);

    expect(response.status).toBe(202);
    expect(sendStkPush).toHaveBeenCalledTimes(1);
  });

  it("starts a new push once the old pending one is stale enough to be abandoned", async () => {
    // Well past the app's own 2-minute poll window - the member has moved on.
    const staleCreatedAt = new Date(Date.now() - 10 * 60 * 1000);
    selectRows.current = [pendingPayment({ id: 31, createdAt: staleCreatedAt })];

    const response = await request(appForPayments()).post("/api/payments/stk-push").send(body);

    expect(response.status).toBe(202);
    expect(sendStkPush).toHaveBeenCalledTimes(1);
  });

  // sendStkPush and accessToken (mpesa.ts) already throw Daraja's own wording
  // or a specific "could not authenticate" message, never anything containing
  // a credential or PIN. That detail used to be logged and saved to
  // resultDesc, then discarded in favour of one hardcoded string in the
  // response — every failure looked identical to whoever hit it, whether the
  // cause was a bad number, expired credentials, or Safaricom being down.
  it("tells the caller what actually went wrong, not a generic string", async () => {
    selectRows.current = [];
    sendStkPush.mockRejectedValueOnce(new Error("Could not authenticate with M-Pesa (401)."));

    const response = await request(appForPayments()).post("/api/payments/stk-push").send(body);

    expect(response.status).toBe(502);
    expect(response.body.error).toBe("Could not authenticate with M-Pesa (401).");
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", resultDesc: "Could not authenticate with M-Pesa (401)." }),
    );
  });
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

  it("reports the actual deadline alongside a success, not just a receipt", async () => {
    selectRows.queue = [
      [pendingPayment()], // the initial payment lookup
      [{ currentPeriodEnd: new Date("2026-11-12T00:00:00.000Z") }], // currentPeriodEndFor
    ];
    queryStkStatus.mockResolvedValue({ resultCode: 0, resultDesc: "ok" });

    const response = await request(appForPayments()).get("/api/payments/21/status");

    expect(response.body.currentPeriodEnd).toBe("2026-11-12T00:00:00.000Z");
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

  it("still reports the deadline for a payment that succeeded earlier, on the callback", async () => {
    selectRows.queue = [
      [pendingPayment({ id: 24, status: "succeeded" })],
      [{ currentPeriodEnd: new Date("2027-01-05T00:00:00.000Z") }],
    ];

    const response = await request(appForPayments()).get("/api/payments/24/status");

    expect(response.body.currentPeriodEnd).toBe("2027-01-05T00:00:00.000Z");
  });

  it("never reports a deadline for a payment that has not succeeded", async () => {
    selectRows.current = [pendingPayment({ id: 26, status: "failed" })];

    const response = await request(appForPayments()).get("/api/payments/26/status");

    expect(response.body.currentPeriodEnd).toBeNull();
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
