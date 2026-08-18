import { Router } from "express";
import { db } from "@workspace/db";
import { incomeSourcesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const router = Router();

/**
 * Income source presets keyed by userId.
 * Served from the API so both web and mobile share one source of truth.
 * Update labels / amounts here and both clients pick them up on next fetch.
 */
const INCOME_SOURCES: Record<string, { label: string; amount: number }[]> = {
  "63497598": [
    { label: "Ujenzi Salary", amount: 76140 },
    { label: "Rental Income", amount: 150000 },
    { label: "Optimum", amount: 40954 },
  ],
  "63570605": [{ label: "EISH", amount: 50000 }],
};

const CHEGE_ID = "63497598";
const LYDIAH_ID = "63570605";

const SEEDS: Array<{ userId: string; name: string; isMain: boolean }> = [
  { userId: CHEGE_ID, name: "Ujenzi Salary", isMain: true },
  { userId: CHEGE_ID, name: "Rental Income", isMain: false },
  { userId: CHEGE_ID, name: "Optimum", isMain: false },
  { userId: LYDIAH_ID, name: "EISH", isMain: true },
];

// Seed default income sources on first request if table is empty
let seeded = false;
async function seedIfEmpty() {
  if (seeded) return;
  const [row] = await db.select({ count: sql<number>`COUNT(*)` }).from(incomeSourcesTable);
  if (Number(row.count) === 0) {
    await db.insert(incomeSourcesTable).values(SEEDS).onConflictDoNothing();
  }
  seeded = true;
}

// GET /api/income-sources?userId=xxx  — list all, or filtered by userId
router.get("/income-sources", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  await seedIfEmpty();

  const userId = req.query.userId as string | undefined;
  const rows = userId
    ? await db.select().from(incomeSourcesTable).where(eq(incomeSourcesTable.userId, userId)).orderBy(incomeSourcesTable.isMain, incomeSourcesTable.id)
    : await db.select().from(incomeSourcesTable).orderBy(incomeSourcesTable.userId, incomeSourcesTable.isMain, incomeSourcesTable.id);

  res.json(rows);
});

// POST /api/income-sources — create a new source
router.post("/income-sources", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const schema = z.object({
    userId: z.string().min(1),
    name: z.string().min(1).max(80),
    isMain: z.boolean().optional().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const [row] = await db.insert(incomeSourcesTable).values(parsed.data).returning();
  res.status(201).json(row);
});

// DELETE /api/income-sources/:id
router.delete("/income-sources/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(incomeSourcesTable).where(eq(incomeSourcesTable.id, id));
  res.json({ ok: true });
});

export default router;
