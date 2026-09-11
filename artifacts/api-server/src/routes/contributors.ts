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
  bankAccountsTable,
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
import { createContributionStatementPdf } from "../lib/contribution-statement-pdf";
import { groupVerifyCode } from "../lib/contribution-verification";
import {
  CONTRIBUTOR_NAME_MAX,
  contributorNameMessage,
  contributorNameProblem,
  normalizeContributorName,
} from "../lib/contributor-name";
import {
  filterStatementToRange,
  monthsToCover,
  type ContributionStatement,
  type StatementEntry,
} from "../lib/contribution-statement";

export type { ContributionStatement, StatementEntry } from "../lib/contribution-statement";
export { formatStatementDate, filterStatementToRange } from "../lib/contribution-statement";

/**
 * Every contribution and every attributed bank deposit for a group over the
 * last `monthsBack` months, as individual dated rows rather than the monthly
 * totals the grid returns. This is what a member's statement and the group
 * ledger are built from. When `range` is given the window is widened to cover
 * `range.from` and the result is trimmed to those exact days.
 */
export async function loadContributionStatement(
  groupId: number,
  monthsBack: number,
  range?: { from: string; to: string },
): Promise<ContributionStatement> {
  const windowMonths = range ? monthsToCover(range.from) : monthsBack;
  const months = gridMonths(Math.min(Math.max(windowMonths, 1), 12));
  const earliest = months[0];
  const latest = months[months.length - 1];
  const periodLabel =
    months.length === 1 ? months[0].label : `${months[0].label} – ${latest.label}`;

  const [contributors, recorded, deposited] = await Promise.all([
    db
      .select({ id: groupContributorsTable.id, name: groupContributorsTable.name, userId: groupContributorsTable.userId })
      .from(groupContributorsTable)
      .where(and(eq(groupContributorsTable.groupId, groupId), isNull(groupContributorsTable.archivedAt)))
      .orderBy(asc(groupContributorsTable.name)),
    db
      .select({
        contributorId: contributionsTable.contributorId,
        name: groupContributorsTable.name,
        amount: contributionsTable.amount,
        month: contributionsTable.month,
        year: contributionsTable.year,
        note: contributionsTable.note,
      })
      .from(contributionsTable)
      .innerJoin(groupContributorsTable, eq(groupContributorsTable.id, contributionsTable.contributorId))
      .where(sql`${contributionsTable.groupId} = ${groupId}
        AND (${contributionsTable.year} > ${earliest.year}
          OR (${contributionsTable.year} = ${earliest.year} AND ${contributionsTable.month} >= ${earliest.month}))`),
    db
      .select({
        contributorId: jointAccountDepositSplitsTable.contributorId,
        name: groupContributorsTable.name,
        amount: jointAccountDepositSplitsTable.amount,
        date: sql<string>`${jointAccountTxTable.date}::text`,
        description: jointAccountTxTable.description,
        bankName: bankAccountsTable.name,
      })
      .from(jointAccountDepositSplitsTable)
      .innerJoin(jointAccountTxTable, eq(jointAccountTxTable.id, jointAccountDepositSplitsTable.transactionId))
      .innerJoin(groupContributorsTable, eq(groupContributorsTable.id, jointAccountDepositSplitsTable.contributorId))
      .leftJoin(bankAccountsTable, eq(bankAccountsTable.id, jointAccountTxTable.accountId))
      .where(sql`${jointAccountDepositSplitsTable.groupId} = ${groupId}
        AND ${jointAccountTxTable.type} = 'deposit'
        AND ${jointAccountTxTable.bankTransferId} IS NULL
        AND ${jointAccountTxTable.date} >= make_date(${earliest.year}, ${earliest.month}, 1)`),
  ]);

  const entries: StatementEntry[] = [
    ...recorded
      .filter((row) => row.contributorId != null)
      .map((row) => ({
        contributorId: row.contributorId as number,
        contributorName: row.name,
        date: `${row.year}-${String(row.month).padStart(2, "0")}-01`,
        amount: Number(row.amount) || 0,
        source: "recorded" as const,
        description: row.note ?? null,
        bankName: null,
      })),
    ...deposited
      .filter((row) => row.contributorId != null)
      .map((row) => ({
        contributorId: row.contributorId as number,
        contributorName: row.name,
        date: row.date.slice(0, 10),
        amount: Number(row.amount) || 0,
        source: "deposit" as const,
        description: row.description ?? null,
        bankName: row.bankName ?? null,
      })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const totalsByContributor: Record<number, number> = {};
  for (const entry of entries) {
    totalsByContributor[entry.contributorId] = (totalsByContributor[entry.contributorId] ?? 0) + entry.amount;
  }

  const statement: ContributionStatement = {
    periodLabel,
    contributors: contributors.map((row) => ({ id: row.id, name: row.name, userId: row.userId ?? null })),
    entries,
    totalsByContributor,
    grandTotal: entries.reduce((sum, entry) => sum + entry.amount, 0),
  };

  return range ? filterStatementToRange(statement, range) : statement;
}

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
  name: z.string().max(CONTRIBUTOR_NAME_MAX * 2),
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
    res.status(400).json({ error: contributorNameMessage("empty") });
    return;
  }

  // One name is not a record of anybody: in a group of forty it cannot be told
  // from the next John, so the ledger row has to carry at least two names.
  const problem = contributorNameProblem(parsed.data.name);
  if (problem) {
    res.status(400).json({ error: contributorNameMessage(problem) });
    return;
  }
  const name = normalizeContributorName(parsed.data.name);

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
    .values({ groupId, name, monthlyTarget })
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
  name: z.string().max(CONTRIBUTOR_NAME_MAX * 2).optional(),
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
    res.status(400).json({ error: "Enter a name, and an amount of zero or more." });
    return;
  }

  const changes: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) {
    // Renaming holds to the same rule as adding, so a row cannot be edited back
    // into an unidentifiable one. Archiving and target changes send no name and
    // are unaffected, which keeps rows that predate the rule manageable.
    const problem = contributorNameProblem(parsed.data.name);
    if (problem) {
      res.status(400).json({ error: contributorNameMessage(problem) });
      return;
    }
    changes.name = normalizeContributorName(parsed.data.name);
  }
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
  defaultMonthlyTarget: z.number().int().min(0).nullable().optional(),
  /** Also write it onto everybody, rather than only onto people added later. */
  applyToEveryone: z.boolean().optional(),
  /** Turn the rotating payout on or off for this budget. */
  merryGoRoundEnabled: z.boolean().optional(),
});

/** What the group expects from each member, and whether that has been decided
 *  at all. */
router.get("/contribution-settings", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const [group] = await db
    .select({ merryGoRoundEnabled: groups.merryGoRoundEnabled })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  res.json({
    defaultMonthlyTarget: await groupDefaultTarget(groupId),
    merryGoRoundEnabled: group?.merryGoRoundEnabled ?? false,
  });
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

  const changes: { defaultMonthlyTarget?: number | null; merryGoRoundEnabled?: boolean } = {};
  if (parsed.data.defaultMonthlyTarget !== undefined) changes.defaultMonthlyTarget = parsed.data.defaultMonthlyTarget;
  if (parsed.data.merryGoRoundEnabled !== undefined) changes.merryGoRoundEnabled = parsed.data.merryGoRoundEnabled;

  if (Object.keys(changes).length === 0) {
    res.status(400).json({ error: "Nothing to change." });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.update(groups).set(changes).where(eq(groups.id, groupId));

    // Setting the figure for the first time should not leave every existing
    // member without one - which is the state that made arrears useless.
    if (parsed.data.applyToEveryone && parsed.data.defaultMonthlyTarget !== undefined) {
      await tx
        .update(groupContributorsTable)
        .set({ monthlyTarget: parsed.data.defaultMonthlyTarget })
        .where(and(
          eq(groupContributorsTable.groupId, groupId),
          isNull(groupContributorsTable.archivedAt),
        ));
    }
  });

  res.json(changes);
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

function statementMonths(req: { query: Record<string, unknown> }): number {
  return Math.min(Math.max(Number(req.query.months) || 6, 1), 12);
}

/** An explicit `?from=YYYY-MM-DD&to=YYYY-MM-DD` day range, when both are
 *  present and well formed. Order is normalised by the loader. */
function statementRange(req: { query: Record<string, unknown> }): { from: string; to: string } | undefined {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const from = typeof req.query.from === "string" ? req.query.from : "";
  const to = typeof req.query.to === "string" ? req.query.to : "";
  return iso.test(from) && iso.test(to) ? { from, to } : undefined;
}

/** Resolve the requested contributor from either `contributorId` or a member
 *  `userId` (the contributions page keys its member cards by user id). */
function statementContributorId(
  req: { query: Record<string, unknown> },
  statement: ContributionStatement,
): number | null {
  const byId = Number(req.query.contributorId);
  if (Number.isInteger(byId) && byId > 0) return byId;
  const userId = typeof req.query.userId === "string" ? req.query.userId : null;
  if (userId) {
    const match = statement.contributors.find((row) => row.userId === userId);
    if (match) return match.id;
  }
  return null;
}

/**
 * The entry-level ledger: every contribution and attributed deposit for the
 * group, or for one member when `contributorId` is given. Manager-only, like
 * the report. JSON for an on-screen view; `.pdf` for a statement to hand out.
 */
router.get("/contributions/statement", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  const statement = await loadContributionStatement(groupId, statementMonths(req), statementRange(req));
  const contributorId = statementContributorId(req, statement);
  if (contributorId === null) {
    res.json(statement);
    return;
  }
  res.json({
    ...statement,
    entries: statement.entries.filter((entry) => entry.contributorId === contributorId),
    grandTotal: statement.totalsByContributor[contributorId] ?? 0,
  });
});

router.get("/contributions/statement.pdf", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  const [group] = await db
    .select({ name: groupsTable.name })
    .from(groupsTable)
    .where(eq(groupsTable.id, groupId))
    .limit(1);

  const statement = await loadContributionStatement(groupId, statementMonths(req), statementRange(req));
  const contributorId = statementContributorId(req, statement);
  const member =
    contributorId != null ? statement.contributors.find((row) => row.id === contributorId) : undefined;
  const entries =
    contributorId != null
      ? statement.entries.filter((entry) => entry.contributorId === contributorId)
      : statement.entries;

  const pdf = await createContributionStatementPdf({
    groupName: group?.name ?? "Shared group",
    periodLabel: statement.periodLabel,
    memberName: member?.name,
    entries: entries.map((entry) => ({
      date: entry.date,
      name: entry.contributorName,
      amount: entry.amount,
      source: entry.source,
      description: entry.description,
      bankName: entry.bankName,
    })),
    total:
      contributorId != null
        ? statement.totalsByContributor[contributorId] ?? 0
        : statement.grandTotal,
    perMemberTotals:
      contributorId != null
        ? []
        : statement.contributors
            .map((row) => ({ name: row.name, total: statement.totalsByContributor[row.id] ?? 0 }))
            .filter((row) => row.total > 0),
  });

  const stamp = new Date();
  const slug = member ? member.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "group";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="jamvi-statement-${slug}-${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, "0")}.pdf"`,
  );
  res.setHeader("Cache-Control", "private, no-store");
  res.send(pdf);
});

export default router;
