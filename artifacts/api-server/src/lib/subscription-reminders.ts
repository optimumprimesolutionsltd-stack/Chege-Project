import {
  db,
  subscriptionRemindersTable,
  userSubscriptionsTable,
  usersTable,
} from "@workspace/db";
import { JAMVI_PACKAGE } from "@workspace/jamvi-pricing";
import { and, eq, inArray } from "drizzle-orm";
import { EmailNotConfiguredError, sendEmail } from "./email";
import { logger } from "./logger";
import {
  REMINDER,
  planFor,
  type ReminderKind,
  type SubscriptionRow,
} from "./subscription-lifecycle";

const SUBSCRIPTION_URL = "https://jamvi.co.ke/app/subscription";

function fromAddress(): string {
  return process.env.INVITATION_FROM_EMAIL?.trim() || "Jamvi <hello@jamvi.co.ke>";
}

/**
 * What each reminder says.
 *
 * Written to be read by somebody who is not thinking about billing. Every one
 * of them says what is still true — records are kept, nothing is deleted —
 * because the point of the message is to bring them back, not to warn them
 * off. None of them threaten.
 */
function compose(kind: ReminderKind, firstName: string): { subject: string; html: string } {
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const price = `KES ${JAMVI_PACKAGE.monthlyPriceKes}`;
  const button = `<p><a href="${SUBSCRIPTION_URL}">Open Jamvi</a></p>`;

  switch (kind) {
    case REMINDER.TRIAL_ENDING_WEEK:
      return {
        subject: "A week left on your free Jamvi",
        html: `<p>${greeting}</p><p>Your free period ends in a week. After that Jamvi is `
          + `${price} a month, which covers your own budget and every group you are part of.</p>`
          + `<p>Nothing disappears if you do not subscribe — your records stay, and Shared `
          + `budgets simply become read-only.</p>${button}`,
      };
    case REMINDER.TRIAL_ENDING_TOMORROW:
      return {
        subject: "Your free Jamvi ends tomorrow",
        html: `<p>${greeting}</p><p>Your free period ends tomorrow. Jamvi is ${price} a month `
          + `from then, groups included.</p><p>If you would rather wait, nothing is lost: `
          + `everything you have recorded stays exactly where it is.</p>${button}`,
      };
    case REMINDER.TRIAL_ENDED:
      return {
        subject: "Your free period has ended",
        html: `<p>${greeting}</p><p>Your free period has ended. Your budget, your history and `
          + `every figure you have entered are all still here.</p><p>Shared budgets are `
          + `read-only until you subscribe, at ${price} a month.</p>${button}`,
      };
    case REMINDER.RENEWAL_DUE:
      return {
        subject: "Your Jamvi renewal is due",
        html: `<p>${greeting}</p><p>Your subscription runs out in a few days. M-Pesa cannot `
          + `take it automatically yet, so it needs a moment from you.</p>`
          + `<p>Paying now adds to the end of your current period — you lose no days by being `
          + `early.</p>${button}`,
      };
    case REMINDER.PAYMENT_MISSED:
      return {
        subject: "We could not take your Jamvi payment",
        html: `<p>${greeting}</p><p>Your subscription was due and we have not received it.</p>`
          + `<p>Nothing has changed yet — you have a week before Shared budgets become `
          + `read-only, and nothing is ever deleted.</p>${button}`,
      };
    case REMINDER.GRACE_ENDING:
      return {
        subject: "Your Shared budgets go read-only tomorrow",
        html: `<p>${greeting}</p><p>Tomorrow your Shared budgets become read-only. You will `
          + `still see everything; you just will not be able to record into them.</p>`
          + `<p>Your own budget carries on as normal, and nothing is deleted at any point.</p>`
          + `${button}`,
      };
  }
}

/**
 * Moves subscriptions on and tells people about it.
 *
 * Safe to run twice. Transitions are written from the state just read, and a
 * reminder is only sent after its row is claimed — the unique index on
 * (user, kind, sentFor) is what makes a second run silent rather than a second
 * inbox.
 */
export async function runSubscriptionLifecycle(now: Date = new Date()): Promise<{
  examined: number;
  transitioned: number;
  remindersSent: number;
}> {
  const rows = await db
    .select({
      id: userSubscriptionsTable.id,
      userId: userSubscriptionsTable.userId,
      status: userSubscriptionsTable.status,
      trialEndsAt: userSubscriptionsTable.trialEndsAt,
      currentPeriodEnd: userSubscriptionsTable.currentPeriodEnd,
      graceEndsAt: userSubscriptionsTable.graceEndsAt,
      email: usersTable.email,
      firstName: usersTable.firstName,
    })
    .from(userSubscriptionsTable)
    .leftJoin(usersTable, eq(usersTable.id, userSubscriptionsTable.userId))
    .where(inArray(userSubscriptionsTable.status, ["trial", "active", "past_due", "cancelled"]));

  let transitioned = 0;
  let remindersSent = 0;

  for (const row of rows) {
    const subscription: SubscriptionRow = {
      id: row.id,
      userId: row.userId,
      status: row.status,
      trialEndsAt: row.trialEndsAt,
      currentPeriodEnd: row.currentPeriodEnd,
      graceEndsAt: row.graceEndsAt,
    };

    const plan = planFor(subscription, now);

    if (plan.transition) {
      await db
        .update(userSubscriptionsTable)
        .set({
          status: plan.transition.status,
          ...(plan.transition.graceEndsAt !== undefined
            ? { graceEndsAt: plan.transition.graceEndsAt }
            : {}),
          updatedAt: now,
        })
        .where(eq(userSubscriptionsTable.id, row.id));
      transitioned += 1;
    }

    for (const reminder of plan.reminders) {
      if (!row.email) continue;

      // Claimed before sending. If this conflicts, the reminder has already
      // gone out and we say nothing — better a missed nudge than a second
      // copy of the same warning.
      const claimed = await db
        .insert(subscriptionRemindersTable)
        .values({ userId: row.userId, kind: reminder.kind, sentFor: reminder.dueFor })
        .onConflictDoNothing()
        .returning({ id: subscriptionRemindersTable.id });

      if (claimed.length === 0) continue;

      const { subject, html } = compose(reminder.kind, row.firstName ?? "");
      try {
        await sendEmail({ from: fromAddress(), to: [row.email], subject, html });
        remindersSent += 1;
      } catch (error) {
        if (error instanceof EmailNotConfiguredError) {
          // No mailer configured. Release the claim so the reminder is not
          // silently marked as sent and lost for good.
          await db
            .delete(subscriptionRemindersTable)
            .where(and(
              eq(subscriptionRemindersTable.userId, row.userId),
              eq(subscriptionRemindersTable.kind, reminder.kind),
              eq(subscriptionRemindersTable.sentFor, reminder.dueFor),
            ));
          logger.warn("Subscription reminders are not being sent: no mailer is configured");
          return { examined: rows.length, transitioned, remindersSent };
        }
        logger.error(
          { err: error, userId: row.userId, kind: reminder.kind },
          "Could not send a subscription reminder",
        );
      }
    }
  }

  return { examined: rows.length, transitioned, remindersSent };
}
