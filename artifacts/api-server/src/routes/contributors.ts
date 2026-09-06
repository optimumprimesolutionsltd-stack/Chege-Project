/**
 * Contributors, and the who-has-paid grid.
 *
 * A contributor is a person in a group, not an account. A church of two
 * hundred will never all sign in, and most chamas have somebody without a
 * smartphone, so the treasurer records for them and they are a name in the
 * ledger like anybody else.
 */

import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  contributionsTable,
  db,
  groupContributorsTable,
  groupMembershipsTable,
  groupsTable,
  jointAccountDepositSplitsTable,
  jointAccountTxTable,
  usersTable,
} from "@workspace/db";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getActiveGroupId, requireGroupManager } from "../lib/activeGroup";
import { buildContributionGrid, gridMonths, type GridEntry } from "../lib/contribution-grid";

const router: IRouter = Router();

/**
 * Everybody in this group who can be credited with money.
 *
 * Members who have never been recorded as contributors are included so the
 * grid opens with the whole group rather than only those who have already
 * paid. Their contributor row is created the first time money is recorded
 * against them.
 */
router.get("/contributors", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const contributors = await db
    .select({
      id: groupContributorsTable.id,
      name: groupContributorsTable.name,
      userId: groupContributorsTable.userId,
      monthlyTarget: groupContributorsTable.monthlyTarget,
      archivedAt: groupContributorsTable.archivedAt,
    })
    .from(groupContributorsTable)
    .where(and(
      eq(groupContributorsTable.groupId, groupId),
      isNull(groupContributorsTable.archivedAt),
    ))
    .orderBy(asc(groupContributorsTable.name));

  res.json(contributors.map((contributor) => ({
    id: contributor.id,
    name: contributor.name,
    hasAccount: contributor.userId !== null,
    monthlyTarget: contributor.monthlyTarget,
  })));
});

const newContributor = z.object({
  name: z.string().trim().min(1).max(120),
  monthlyTarget: z.number().int().min(0).nullable().optional(),
});

/** Add somebody by name. No account, no invitation, no email - the treasurer
 *  writes down who gave money, exactly as they would on paper. */
router.post("/contributors", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  const parsed = newContributor.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a name of up to 120 characters." });
    return;
  }

  // Names are deliberately not unique: two people really can both be called
  // John, and refusing the second is worse than showing both.
  const [created] = await db
    .insert(groupContributorsTable)
    .values({
      groupId,
      name: parsed.data.name,
      monthlyTarget: parsed.data.monthlyTarget ?? null,
    })
    .returning();

  res.status(201).json({ id: created.id, name: created.name, hasAccount: false, monthlyTarget: created.monthlyTarget });
});

/**
 * The sheet: contributors down the side, months across the top.
 *
 * Reads both places money is recorded. Deposits with their splits are what
 * moves the group balance; the contributions table is the older per-person
 * record. A group using either, or both, sees one honest total.
 */
router.get("/contributions/grid", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const monthsBack = Math.min(Math.max(Number(req.query.months) || 6, 1), 12);
  const months = gridMonths(monthsBack);
  const earliest = months[0];

  const [contributors, recorded, deposited] = await Promise.all([
    db
      .select({
        id: groupContributorsTable.id,
        name: groupContributorsTable.name,
        monthlyTarget: groupContributorsTable.monthlyTarget,
        archivedAt: groupContributorsTable.archivedAt,
      })
      .from(groupContributorsTable)
      .where(eq(groupContributorsTable.groupId, groupId)),
    db
      .select({
        contributorId: contributionsTable.contributorId,
        amount: contributionsTable.amount,
        month: contributionsTable.month,
        year: contributionsTable.year,
      })
      .from(contributionsTable)
      .where(sql`${contributionsTable.groupId} = ${groupId}
        AND (${contributionsTable.year} > ${earliest.year}
          OR (${contributionsTable.year} = ${earliest.year} AND ${contributionsTable.month} >= ${earliest.month}))`),
    db
      .select({
        contributorId: jointAccountDepositSplitsTable.contributorId,
        amount: jointAccountDepositSplitsTable.amount,
        month: sql<number>`EXTRACT(MONTH FROM ${jointAccountTxTable.date})`,
        year: sql<number>`EXTRACT(YEAR FROM ${jointAccountTxTable.date})`,
      })
      .from(jointAccountDepositSplitsTable)
      .innerJoin(jointAccountTxTable, eq(jointAccountTxTable.id, jointAccountDepositSplitsTable.transactionId))
      .where(sql`${jointAccountDepositSplitsTable.groupId} = ${groupId}
        AND ${jointAccountTxTable.type} = 'deposit'
        AND ${jointAccountTxTable.bankTransferId} IS NULL
        AND ${jointAccountTxTable.date} >= make_date(${earliest.year}, ${earliest.month}, 1)`),
  ]);

  const entries: GridEntry[] = [
    ...recorded.map((row) => ({
      contributorId: row.contributorId,
      amount: row.amount,
      month: Number(row.month),
      year: Number(row.year),
    })),
    ...deposited.map((row) => ({
      contributorId: row.contributorId,
      amount: row.amount,
      month: Number(row.month),
      year: Number(row.year),
    })),
  ];

  res.json(buildContributionGrid({ months, contributors, entries }));
});

export default router;
