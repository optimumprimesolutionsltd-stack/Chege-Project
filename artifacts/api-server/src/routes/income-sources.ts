import { incomeMonthsReady, keepEarlierIncomeMonths, monthExpected, setIncomeOnlyThisMonth } from "../lib/income-months";
import { nairobiMonth } from "../lib/budget-months";
import { Router } from "express";
import { db } from "@workspace/db";
import { groupMembershipsTable, incomeSourcesTable } from "@workspace/db";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getActiveGroupId, isGroupManager, requireMemberSelfAttribution, requireTransactionEligibility } from "../lib/activeGroup";
import { dedupeIncomeSources, normalizeIncomeSourceName } from "./income-source-utils";
import { businessStreamIds } from "../lib/business-streams";
export { dedupeIncomeSources, normalizeIncomeSourceName } from "./income-source-utils";

const router = Router();

async function isGroupMember(userId: string, groupId: number): Promise<boolean> {
  const [member] = await db
    .select({ userId: groupMembershipsTable.userId })
    .from(groupMembershipsTable)
    .where(
      and(
        eq(groupMembershipsTable.groupId, groupId),
        eq(groupMembershipsTable.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(member);
}

// GET /api/income-sources?userId=xxx  — list all, or filtered by userId
router.get("/income-sources", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const userId = req.query.userId as string | undefined;
  if (userId && !(await isGroupMember(userId, groupId))) {
    res.status(400).json({ error: "User is not a member of this shared group." });
    return;
  }
  const rows = userId
    ? await db.select().from(incomeSourcesTable)
        .where(and(eq(incomeSourcesTable.groupId, groupId), eq(incomeSourcesTable.userId, userId)))
        .orderBy(incomeSourcesTable.isMain, incomeSourcesTable.id)
    : await db.select().from(incomeSourcesTable)
        .where(eq(incomeSourcesTable.groupId, groupId))
        .orderBy(incomeSourcesTable.userId, incomeSourcesTable.isMain, incomeSourcesTable.id);

  // ?year=&month=: each source with what was expected of it in that month
  // (lib/income-months), for the Budget page showing a month. Without them,
  // the amount expected now.
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  const forMonth = Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12 && year >= 2000 && year <= 2100;
  // ?streams=only: your income streams, without My businesses - a business is
  // never an income stream (lib/business-streams). Pickers for money in ask
  // this way; screens about businesses read them from /api/businesses.
  const businesses = req.query.streams === "only" ? new Set(await businessStreamIds(groupId)) : new Set<number>();
  const sources = dedupeIncomeSources(rows).filter((source) => !businesses.has(source.id));
  res.json(forMonth ? await monthExpected(groupId, sources, year, month) : sources);
});

// POST /api/income-sources — create a new source
router.post("/income-sources", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!await requireTransactionEligibility(req, res)) return;

  const schema = z.object({
    userId: z.string().min(1),
    name: z.string().min(1).max(80),
    isMain: z.boolean().optional().default(false),
    expectedMonthlyAmount: z.number().int().min(0).optional().default(0),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  if (!requireMemberSelfAttribution(req, res, [parsed.data.userId])) return;
  if (!(await isGroupMember(parsed.data.userId, groupId))) {
    res.status(400).json({ error: "User is not a member of this shared group." });
    return;
  }

  const normalizedName = normalizeIncomeSourceName(parsed.data.name);
  const [existing] = await db
    .select({ id: incomeSourcesTable.id })
    .from(incomeSourcesTable)
    .where(and(
      eq(incomeSourcesTable.groupId, groupId),
      eq(incomeSourcesTable.userId, parsed.data.userId),
      sql`lower(trim(${incomeSourcesTable.name})) = ${normalizedName}`,
    ))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "An income source with this name already exists for this member." });
    return;
  }

  const [row] = await db.insert(incomeSourcesTable).values({ ...parsed.data, groupId }).returning();
  res.status(201).json(row);
});

// PUT /api/income-sources/:id — rename a source
router.put("/income-sources/:id", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const monthOf = z.object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) });
  const schema = z.object({
    name: z.string().min(1).max(80),
    isMain: z.boolean().optional(),
    expectedMonthlyAmount: z.number().int().min(0).optional(),
    // Which months a new expected amount reaches (lib/income-months). Left
    // out, it applies from this month on and earlier months keep theirs.
    expectedFrom: monthOf.optional(),
    onlyThisMonth: monthOf.optional(),
  });
  const parsedAll = schema.safeParse(req.body);
  if (!parsedAll.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const { expectedFrom, onlyThisMonth, ...fields } = parsedAll.data;
  const parsed = { data: fields };
  const [existing] = await db.select({ userId: incomeSourcesTable.userId, expectedMonthlyAmount: incomeSourcesTable.expectedMonthlyAmount }).from(incomeSourcesTable)
    .where(and(eq(incomeSourcesTable.id, id), eq(incomeSourcesTable.groupId, groupId))).limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!isGroupManager(req) && existing.userId !== req.user!.id) {
    res.status(403).json({ error: "Members can manage only their own income sources." });
    return;
  }
  const [duplicate] = await db
    .select({ id: incomeSourcesTable.id })
    .from(incomeSourcesTable)
    .where(and(
      eq(incomeSourcesTable.groupId, groupId),
      eq(incomeSourcesTable.userId, existing.userId),
      ne(incomeSourcesTable.id, id),
      sql`lower(trim(${incomeSourcesTable.name})) = ${normalizeIncomeSourceName(parsed.data.name)}`,
    ))
    .limit(1);
  if (duplicate) {
    res.status(409).json({ error: "An income source with this name already exists for this member." });
    return;
  }
  if (onlyThisMonth && parsed.data.expectedMonthlyAmount !== undefined) {
    if (!incomeMonthsReady()) { res.status(503).json({ error: "Expected income for one month cannot be kept yet. Try again in a minute." }); return; }
    await setIncomeOnlyThisMonth({ groupId, sourceId: id, year: onlyThisMonth.year, month: onlyThisMonth.month, amount: parsed.data.expectedMonthlyAmount });
    delete parsed.data.expectedMonthlyAmount;
  } else if (parsed.data.expectedMonthlyAmount !== undefined && parsed.data.expectedMonthlyAmount !== existing.expectedMonthlyAmount) {
    await keepEarlierIncomeMonths({ groupId, sourceId: id, previous: existing.expectedMonthlyAmount, from: expectedFrom ?? nairobiMonth() });
  }
  const [row] = await db.update(incomeSourcesTable).set(parsed.data)
    .where(and(eq(incomeSourcesTable.id, id), eq(incomeSourcesTable.groupId, groupId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// DELETE /api/income-sources/:id
router.delete("/income-sources/:id", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!isGroupManager(req)) {
    const [existing] = await db.select({ userId: incomeSourcesTable.userId }).from(incomeSourcesTable)
      .where(and(eq(incomeSourcesTable.id, id), eq(incomeSourcesTable.groupId, groupId))).limit(1);
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (existing.userId !== req.user!.id) {
      res.status(403).json({ error: "Members can manage only their own income sources." });
      return;
    }
  }
  await db.delete(incomeSourcesTable)
    .where(and(eq(incomeSourcesTable.id, id), eq(incomeSourcesTable.groupId, groupId)));
  res.json({ ok: true });
});

export default router;
