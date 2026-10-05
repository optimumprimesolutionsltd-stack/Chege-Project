import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { jointAccountTxTable } from "@workspace/db";
import type { DbOrTransaction } from "./account-deletion";

/**
 * "Fix all" on Find the difference: an M-Pesa charge the balance shows was
 * taken but never saved, added to its payment in the M-Pesa account - filed as
 * the budget's other M-Pesa charges are, on the payment's day. Only to a
 * payment there with an M-Pesa code that is not itself a charge.
 */
export async function addMissingCharges(
  tx: DbOrTransaction,
  groupId: number,
  accountId: number,
  charges: ReadonlyArray<{ entryId: number; amount: number }>,
): Promise<number> {
  if (charges.length === 0) return 0;
  const [usual] = await tx
    .select({ category: jointAccountTxTable.expenseCategory })
    .from(jointAccountTxTable)
    .where(and(eq(jointAccountTxTable.groupId, groupId), isNotNull(jointAccountTxTable.chargeForTransactionId), isNotNull(jointAccountTxTable.expenseCategory)))
    .groupBy(jointAccountTxTable.expenseCategory)
    .orderBy(desc(sql`count(*)`))
    .limit(1);
  let charged = 0;
  for (const charge of charges) {
    const [payment] = await tx
      .select({ id: jointAccountTxTable.id, date: jointAccountTxTable.date, description: jointAccountTxTable.description, madeById: jointAccountTxTable.madeById })
      .from(jointAccountTxTable)
      .where(and(
        eq(jointAccountTxTable.groupId, groupId),
        eq(jointAccountTxTable.id, charge.entryId),
        eq(jointAccountTxTable.accountId, accountId),
        isNotNull(jointAccountTxTable.mpesaReceipt),
        isNull(jointAccountTxTable.chargeForTransactionId),
      ))
      .limit(1);
    if (!payment) continue;
    await tx.insert(jointAccountTxTable).values({
      groupId,
      accountId,
      type: "disbursement",
      amount: Math.round(charge.amount * 100) / 100,
      description: `M-Pesa charge — ${payment.description}`,
      date: payment.date,
      madeById: payment.madeById,
      expenseCategory: usual?.category ?? null,
      chargeForTransactionId: payment.id,
    });
    charged += 1;
  }
  return charged;
}
