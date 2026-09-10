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
  groupsTable as groups,
  groupContributorsTable,
  groupMembershipsTable,
  groupsTable,
  jointAccountDepositSplitsTable,
  jointAccountTxTable,
  usersTable,
} from "@workspace/db";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getActiveGroupId, requireGroupManager } from "../lib/activeGroup";
import { buildContributionGrid, gridMonths, type ContributionGrid, type GridEntry } from "../lib/contribution-grid";
import { createContributionReportPdf } from "../lib/contribution-report-pdf";
import { groupVerifyCode } from "../lib/contribution-verification";

/** The absolute URL of the public page that verifies a group's report. */
function verifyUrlFor(req: { protocol: string; get(name: string): string | undefined }, groupId: number): string {
  const configured = process.env.APP_ORIGIN?.trim().replace(/\/$/, "");
  const origin = configured || `${req.protocol}://${req.get("host") ?? "jamvi.co.ke"}`;
  return `${origin}/r/${groupVerifyCode(groupId)}`;
}

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

  // What the group expects, unless this person is told to be different. A
  // treasurer setting the figure once is the common case; setting it forty
  // times is not.
  const monthlyTarget = parsed.data.monthlyTarget !== undefined
    ? parsed.data.monthlyTarget
    : await groupDefaultTarget(groupId);

  // Names are deliberately not unique: two people really can both be called
  // John, and refusing the second is worse than showing both.
  const [created] = await db
    .insert(groupContributorsTable)
    .values({ groupId, name: parsed.data.name, monthlyTarget })
    .returning();

  res.status(201).json({ id: created.id, name: created.name, hasAccount: false, monthlyTarget: created.monthlyTarget });
});

/** What this group expects from a member each month, or null where giving is
 *  voluntary. Seeds a new contributor so the figure is set once, not forty
 *  times. */
async function groupDefaultTarget(groupId: number): Promise<number | null> {
  const [group] = await db
    .select({ defaultMonthlyTarget: groups.defaultMonthlyTarget })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  return group?.defaultMonthlyTarget ?? null;
}

const contributorUpdate = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  // Explicit null is meaningful: it says this person is not expected to give a
  // set amount, which is different from not saying.
  monthlyTarget: z.number().int().min(0).nullable().optional(),
  archived: z.boolean().optional(),
});

/**
 * Change a contributor: what they are called, what they are expected to give,
 * or whether they are still in the group.
 *
 * Without this a target could only ever be set at the moment somebody was
 * added, which meant that in practice it was never set at all - and the
 * arrears column, which is measured against it, was empty for every group.
 */
router.patch("/contributors/:id", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "That contributor does not exist." });
    return;
  }

  const parsed = contributorUpdate.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a name of up to 120 characters, and an amount of zero or more." });
    return;
  }

  const changes: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) changes.name = parsed.data.name;
  if (parsed.data.monthlyTarget !== undefined) changes.monthlyTarget = parsed.data.monthlyTarget;
  // Archived, never deleted: somebody who has left still contributed what they
  // contributed, and removing them would make last year's totals disagree with
  // last year's rows.
  if (parsed.data.archived !== undefined) changes.archivedAt = parsed.data.archived ? new Date() : null;

  if (Object.keys(changes).length === 0) {
    res.status(400).json({ error: "Nothing to change." });
    return;
  }

  const [updated] = await db
    .update(groupContributorsTable)
    .set(changes)
    // Scoped to the active group: an id from another group must not be
    // reachable by guessing.
    .where(and(eq(groupContributorsTable.id, id), eq(groupContributorsTable.groupId, groupId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "That contributor is not in this group." });
    return;
  }

  res.json({
    id: updated.id,
    name: updated.name,
    hasAccount: updated.userId !== null,
    monthlyTarget: updated.monthlyTarget,
    archived: updated.archivedAt !== null,
  });
});

const settingsUpdate = z.object({
  defaultMonthlyTarget: z.number().int().min(0).nullable(),
  /** Also write it onto everybody, rather than only onto people added later. */
  applyToEveryone: z.boolean().optional(),
});

/** What the group expects from each member, and whether that has been decided
 *  at all. */
router.get("/contribution-settings", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  res.json({ defaultMonthlyTarget: await groupDefaultTarget(groupId) });
});

router.patch("/contribution-settings", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  const parsed = settingsUpdate.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter an amount of zero or more, or leave it blank." });
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(groups)
      .set({ defaultMonthlyTarget: parsed.data.defaultMonthlyTarget })
      .where(eq(groups.id, groupId));

    // Setting the figure for the first time should not leave every existing
    // member without one - which is the state that made arrears useless.
    if (parsed.data.applyToEveryone) {
      await tx
        .update(groupContributorsTable)
        .set({ monthlyTarget: parsed.data.defaultMonthlyTarget })
        .where(and(
          eq(groupContributorsTable.groupId, groupId),
          isNull(groupContributorsTable.archivedAt),
        ));
    }
  });

  res.json({ defaultMonthlyTarget: parsed.data.defaultMonthlyTarget });
});

/**
 * The sheet: contributors down the side, months across the top.
 *
 * Reads both places money is recorded. Deposits with their splits are what
 * moves the group balance; the contributions table is the older per-person
 * record. A group using either, or both, sees one honest total.
 */
/**
 * Load the who-has-paid grid for a group over the last `monthsBack` months.
 * Shared by the JSON grid endpoint and the PDF report so both read money from
 * the same two places and carry a surplus forward the same way.
 */
export async function loadContributionGrid(groupId: number, monthsBack: number): Promise<ContributionGrid> {
  const months = gridMonths(Math.min(Math.max(monthsBack, 1), 12));
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

  return buildContributionGrid({ months, contributors, entries });
}

router.get("/contributions/grid", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const monthsBack = Math.min(Math.max(Number(req.query.months) || 6, 1), 12);
  res.json(await loadContributionGrid(groupId, monthsBack));
});

/**
 * The code and public URL that let a recipient check a shared report against
 * the group's live data. Manager-only, matching who can produce a report.
 */
router.get("/contributions/verify-link", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  res.json({ code: groupVerifyCode(groupId), url: verifyUrlFor(req, groupId) });
});

/**
 * The same grid as a PDF, for handing a chama or church their record or
 * forwarding it to the group's WhatsApp. Manager-only, matching the download
 * controls in the web app.
 */
router.get("/contributions/report.pdf", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  const monthsBack = Math.min(Math.max(Number(req.query.months) || 6, 1), 12);
  const [group] = await db
    .select({ name: groupsTable.name })
    .from(groupsTable)
    .where(eq(groupsTable.id, groupId))
    .limit(1);
  const grid = await loadContributionGrid(groupId, monthsBack);

  const periodLabel =
    grid.months.length === 0
      ? ""
      : grid.months.length === 1
        ? grid.months[0].label
        : `${grid.months[0].label} – ${grid.months[grid.months.length - 1].label}`;
  const totalExpected = grid.rows.reduce(
    (sum, row) => sum + (row.monthlyTarget != null ? row.monthlyTarget * grid.months.length : 0),
    0,
  );

  const pdf = await createContributionReportPdf({
    groupName: group?.name ?? "Shared group",
    periodLabel,
    months: grid.months.map((month) => ({ label: month.label })),
    rows: grid.rows.map((row) => ({
      name: row.name,
      monthlyTarget: row.monthlyTarget,
      amounts: row.amounts,
      total: row.total,
      outstanding: row.outstanding,
      creditRemaining: row.creditRemaining,
    })),
    grandTotal: grid.grandTotal,
    totalExpected,
    verifyUrl: verifyUrlFor(req, groupId),
  });

  const now = new Date();
  const filename = `jamvi-contributions-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(pdf);
});

export default router;
