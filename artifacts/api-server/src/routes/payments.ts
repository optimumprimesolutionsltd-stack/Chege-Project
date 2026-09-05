import { Router } from "express";
import { db, paymentsTable, PAYMENT_STATUS } from "@workspace/db";
import { BILLING_INTERVAL, type BillingInterval } from "@workspace/jamvi-pricing";
import { and, eq } from "drizzle-orm";
import {
  isMpesaConfigured,
  normalizeMsisdn,
  queryStkStatus,
  readCallback,
  sendStkPush,
} from "../lib/mpesa";
import {
  activateSubscription,
  recordRedemption,
  resolvePrice,
} from "../lib/subscription-billing";

/** Safaricom posts here with no signature, so it cannot sit behind requireMember. */
export const publicPaymentsRouter = Router();
export const paymentsRouter = Router();

function billingIntervalFrom(value: unknown): BillingInterval | null {
  if (value === BILLING_INTERVAL.MONTHLY || value === BILLING_INTERVAL.ANNUAL) return value;
  return null;
}

/**
 * Starts a payment: writes the attempt down, then asks Safaricom to prompt.
 *
 * The row is created before the prompt so that a callback always has something
 * to reconcile against. A prompt that is sent with nothing recorded is a
 * payment nobody can account for.
 */
paymentsRouter.post("/payments/stk-push", async (req, res): Promise<void> => {
  if (!isMpesaConfigured()) {
    res.status(503).json({ error: "M-Pesa payments are not available yet." });
    return;
  }

  const interval = billingIntervalFrom(req.body?.billingInterval);
  if (!interval) {
    res.status(400).json({ error: "Choose monthly or annual." });
    return;
  }

  let phoneNumber: string;
  try {
    phoneNumber = normalizeMsisdn(String(req.body?.phoneNumber ?? ""));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Enter a valid number." });
    return;
  }

  const { amountKes, promoCode } = await resolvePrice(interval, req.body?.promoCode);

  const [payment] = await db
    .insert(paymentsTable)
    .values({
      userId: req.user!.id,
      billingInterval: interval,
      amountKes,
      promoCode,
      phoneNumber,
      status: PAYMENT_STATUS.PENDING,
    })
    .returning({ id: paymentsTable.id });

  try {
    const push = await sendStkPush({
      phoneNumber,
      amountKes,
      // What the member sees on their statement, and what support searches by.
      accountReference: `JAMVI-${payment.id}`,
      description: interval === BILLING_INTERVAL.ANNUAL
        ? "Jamvi annual subscription"
        : "Jamvi monthly subscription",
    });

    await db
      .update(paymentsTable)
      .set({
        merchantRequestId: push.merchantRequestId,
        checkoutRequestId: push.checkoutRequestId,
        updatedAt: new Date(),
      })
      .where(eq(paymentsTable.id, payment.id));

    res.status(202).json({
      paymentId: payment.id,
      amountKes,
      promoApplied: promoCode !== null,
      message: push.customerMessage,
    });
  } catch (error) {
    await db
      .update(paymentsTable)
      .set({
        status: PAYMENT_STATUS.FAILED,
        resultDesc: error instanceof Error ? error.message : "Could not reach M-Pesa.",
        updatedAt: new Date(),
      })
      .where(eq(paymentsTable.id, payment.id));

    req.log.error({ err: error, paymentId: payment.id }, "Could not start an M-Pesa payment");
    res.status(502).json({ error: "Could not reach M-Pesa. Please try again." });
  }
});

/**
 * Where the member's own screen finds out what happened.
 *
 * Falls back to asking Safaricom directly, because an ignored prompt produces
 * no callback at all. Without this a payment stays pending forever and the
 * member is told nothing.
 */
paymentsRouter.get("/payments/:id/status", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Unknown payment." });
    return;
  }

  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(and(eq(paymentsTable.id, id), eq(paymentsTable.userId, req.user!.id)))
    .limit(1);

  if (!payment) {
    res.status(404).json({ error: "Unknown payment." });
    return;
  }

  if (payment.status === PAYMENT_STATUS.PENDING && payment.checkoutRequestId) {
    try {
      const result = await queryStkStatus(payment.checkoutRequestId);
      // 1032 is the member cancelling; anything non-zero means it did not
      // complete. Only the callback carries a receipt, so a success seen here
      // is left pending for the callback to finish.
      if (result.resultCode > 0) {
        await db
          .update(paymentsTable)
          .set({
            status: PAYMENT_STATUS.FAILED,
            resultCode: result.resultCode,
            resultDesc: result.resultDesc,
            updatedAt: new Date(),
          })
          .where(eq(paymentsTable.id, payment.id));
        res.json({ status: PAYMENT_STATUS.FAILED, detail: result.resultDesc });
        return;
      }
    } catch (error) {
      // A query that fails says nothing about the payment, so the member is
      // told it is still pending rather than that it failed.
      req.log.warn({ err: error, paymentId: payment.id }, "Could not query M-Pesa status");
    }
  }

  res.json({
    status: payment.status,
    amountKes: payment.amountKes,
    receipt: payment.mpesaReceiptNumber,
    detail: payment.resultDesc,
  });
});

/**
 * Safaricom's callback.
 *
 * Public and unsigned, so nothing here is believed on its own. The only thing
 * that makes a callback credible is that it quotes a checkoutRequestId we
 * issued; one naming anything else is acknowledged and discarded.
 *
 * Always answers 200. Safaricom retries anything else, and a retry storm
 * against a callback we have already handled is worse than a lost one, which
 * the status query recovers anyway.
 */
publicPaymentsRouter.post("/mpesa/callback", async (req, res): Promise<void> => {
  const facts = readCallback(req.body);
  if (!facts) {
    req.log.warn("Discarded an M-Pesa callback that could not be read");
    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.checkoutRequestId, facts.checkoutRequestId))
        .for("update")
        .limit(1);

      if (!payment) {
        req.log.warn(
          { checkoutRequestId: facts.checkoutRequestId },
          "Discarded an M-Pesa callback for an unknown payment",
        );
        return;
      }

      // Retries land here. Settled payments are left exactly as they are, so
      // one payment can never extend a subscription twice.
      if (payment.status !== PAYMENT_STATUS.PENDING) return;

      if (facts.resultCode !== 0) {
        await tx
          .update(paymentsTable)
          .set({
            status: PAYMENT_STATUS.FAILED,
            resultCode: facts.resultCode,
            resultDesc: facts.resultDesc,
            updatedAt: new Date(),
          })
          .where(eq(paymentsTable.id, payment.id));
        return;
      }

      const now = new Date();
      await tx
        .update(paymentsTable)
        .set({
          status: PAYMENT_STATUS.SUCCEEDED,
          resultCode: facts.resultCode,
          resultDesc: facts.resultDesc,
          mpesaReceiptNumber: facts.mpesaReceiptNumber,
          paidAt: now,
          updatedAt: now,
        })
        .where(eq(paymentsTable.id, payment.id));

      await activateSubscription({
        userId: payment.userId,
        interval: payment.billingInterval as BillingInterval,
        promoCode: payment.promoCode,
        executor: tx,
        now,
      });

      // Counted here rather than at checkout, so an abandoned prompt does not
      // use up a place on a capped code.
      if (payment.promoCode) await recordRedemption(payment.promoCode, tx);
    });
  } catch (error) {
    req.log.error({ err: error }, "Could not process an M-Pesa callback");
  }

  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});
