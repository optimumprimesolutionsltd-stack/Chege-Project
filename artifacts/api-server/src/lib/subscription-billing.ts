import { db, promoCodesTable, userSubscriptionsTable } from "@workspace/db";
import {
  BILLING_INTERVAL,
  JAMVI_PACKAGE,
  PACKAGE_CODE,
  SUBSCRIPTION_STATUS,
  type BillingInterval,
} from "@workspace/jamvi-pricing";
import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";

type DbOrTransaction = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ResolvedPrice {
  amountKes: number;
  promoCode: string | null;
}

/**
 * What this member should be charged.
 *
 * A promo code is the whole student mechanism: rather than proving who is a
 * student, a code is given to a campus representative or chama secretary and
 * verifies by association. An invalid, spent or expired code is not an error —
 * it quietly falls back to the standard price, because refusing the payment
 * would cost a paying member over a discount they were merely hoping for.
 */
export async function resolvePrice(
  interval: BillingInterval,
  promoCode: string | null | undefined,
  executor: DbOrTransaction = db,
  now: Date = new Date(),
): Promise<ResolvedPrice> {
  const standard = interval === BILLING_INTERVAL.ANNUAL
    ? JAMVI_PACKAGE.annualPriceKes
    : JAMVI_PACKAGE.monthlyPriceKes;

  const code = promoCode?.trim().toUpperCase();
  if (!code) return { amountKes: standard, promoCode: null };

  const [promo] = await executor
    .select({
      code: promoCodesTable.code,
      monthlyPriceKes: promoCodesTable.monthlyPriceKes,
      annualPriceKes: promoCodesTable.annualPriceKes,
      maxRedemptions: promoCodesTable.maxRedemptions,
      redemptions: promoCodesTable.redemptions,
    })
    .from(promoCodesTable)
    .where(and(
      eq(promoCodesTable.code, code),
      eq(promoCodesTable.enabled, true),
      or(isNull(promoCodesTable.expiresAt), gt(promoCodesTable.expiresAt, now)),
    ))
    .limit(1);

  if (!promo) return { amountKes: standard, promoCode: null };
  if (promo.maxRedemptions !== null && promo.redemptions >= promo.maxRedemptions) {
    return { amountKes: standard, promoCode: null };
  }

  return {
    amountKes: interval === BILLING_INTERVAL.ANNUAL
      ? promo.annualPriceKes
      : promo.monthlyPriceKes,
    promoCode: promo.code,
  };
}

/** Counted only when a payment actually succeeds, so an abandoned prompt does
 *  not use up a place on a capped code. */
export async function recordRedemption(
  code: string,
  executor: DbOrTransaction = db,
): Promise<void> {
  await executor
    .update(promoCodesTable)
    .set({ redemptions: sql`${promoCodesTable.redemptions} + 1` })
    .where(eq(promoCodesTable.code, code));
}

export function periodEnd(from: Date, interval: BillingInterval): Date {
  const end = new Date(from);
  if (interval === BILLING_INTERVAL.ANNUAL) {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}

/**
 * Puts a member on a paid footing after a confirmed payment.
 *
 * Extends from whichever is later: now, or the end of what they have already
 * paid for. Someone who renews early is not silently charged for days they
 * already owned, which is the kind of quiet loss that ends trust in a money
 * app faster than an outage does.
 *
 * Idempotency is the caller's job — Safaricom retries callbacks, and the
 * unique index on payments.checkout_request_id is what makes a repeat arrive
 * here at most once.
 */
export async function activateSubscription(params: {
  userId: string;
  interval: BillingInterval;
  promoCode?: string | null;
  executor?: DbOrTransaction;
  now?: Date;
}): Promise<void> {
  const executor = params.executor ?? db;
  const now = params.now ?? new Date();

  const [existing] = await executor
    .select({
      id: userSubscriptionsTable.id,
      currentPeriodEnd: userSubscriptionsTable.currentPeriodEnd,
    })
    .from(userSubscriptionsTable)
    .where(and(
      eq(userSubscriptionsTable.userId, params.userId),
      inArray(userSubscriptionsTable.status, [
        SUBSCRIPTION_STATUS.TRIAL,
        SUBSCRIPTION_STATUS.PENDING,
        SUBSCRIPTION_STATUS.ACTIVE,
        SUBSCRIPTION_STATUS.PAST_DUE,
        SUBSCRIPTION_STATUS.CANCELLED,
      ]),
    ))
    .limit(1);

  const paidUntil = existing?.currentPeriodEnd && existing.currentPeriodEnd > now
    ? existing.currentPeriodEnd
    : now;

  const values = {
    status: SUBSCRIPTION_STATUS.ACTIVE,
    billingInterval: params.interval,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd(paidUntil, params.interval),
    graceEndsAt: null,
    cancelledAt: null,
    promoCode: params.promoCode ?? null,
    updatedAt: now,
  };

  if (existing) {
    await executor
      .update(userSubscriptionsTable)
      .set(values)
      .where(eq(userSubscriptionsTable.id, existing.id));
    return;
  }

  await executor.insert(userSubscriptionsTable).values({
    userId: params.userId,
    packageCode: PACKAGE_CODE.JAMVI,
    ...values,
  });
}
