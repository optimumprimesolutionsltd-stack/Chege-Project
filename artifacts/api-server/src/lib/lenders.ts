import { db, groupContributorsTable } from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";

/**
 * Lenders reached through M-Pesa each have their own name in Who owes who:
 * Fuliza, M-Shwari, KCB M-PESA and Hustler Fund (the import adds them; see
 * mobile-budget lib/mpesaProducts). Fuliza was added as "Safaricom PLC" until
 * 5 Oct 2026.
 */
export const FULIZA_PARTY_NAME = "Fuliza";
const FORMER_FULIZA_NAME = "safaricom plc";

/**
 * The "Safaricom PLC" Jamvi added for Fuliza is renamed Fuliza, keeping its
 * balance and history. Only that exact name, and only when the budget has no
 * Fuliza already. Safe to run on every listing: once renamed it matches nothing.
 */
export async function renameFormerFulizaParty(groupId: number): Promise<void> {
  await db.update(groupContributorsTable)
    .set({ name: FULIZA_PARTY_NAME })
    .where(and(
      eq(groupContributorsTable.groupId, groupId),
      isNull(groupContributorsTable.archivedAt),
      sql`lower(btrim(${groupContributorsTable.name})) = ${FORMER_FULIZA_NAME}`,
      sql`NOT EXISTS (SELECT 1 FROM group_contributors other WHERE other.group_id = ${groupId} AND lower(btrim(other.name)) = 'fuliza')`,
    ));
}
