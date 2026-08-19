import { Router } from "express";
import { db } from "@workspace/db";
import { budgetCategoriesTable, jointAccountTxTable, usersTable, membersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const DepositInput = z.object({
  amount: z.number().int().positive(),
  description: z.string().min(1),
  date: z.string().min(1),
  madeById: z.string().nullable().optional(),
  incomeSourceId: z.number().int().positive().optional(),
});

const DisbursementInput = z.object({
  amount: z.number().int().positive(),
  description: z.string().trim().max(200).optional().default(""),
  date: z.string().min(1),
  madeById: z.string().nullable().optional(),
  expenseCategory: z.string().trim().min(1).max(80),
});

const UpdateJointAccountInput = z.object({
  amount: z.number().int().positive(),
  description: z.string().trim().max(200).optional(),
  date: z.string().min(1),
  madeById: z.string().nullable().optional(),
  incomeSourceId: z.number().int().positive().nullable().optional(),
  expenseCategory: z.string().trim().min(1).max(80).optional(),
});

const IdParam = z.object({ id: z.coerce.number().int().positive() });

async function enrichTx(tx: typeof jointAccountTxTable.$inferSelect) {
  const user = tx.madeById
    ? await db.query.usersTable.findFirst({ where: eq(usersTable.id, tx.madeById) })
    : null;
  return {
    ...tx,
    // null madeById = Joint bank (shared household); name resolves to null so UI can show "Joint bank"
    madeByName: user?.firstName ?? null,
    expenseCategory: tx.expenseCategory ?? null,
    createdAt: tx.createdAt instanceof Date ? tx.createdAt.toISOString() : tx.createdAt,
  };
}

/** Validate that a non-null member ID belongs to the household. Returns an error string or null. */
async function validateMemberId(id: string): Promise<string | null> {
  const [member] = await db
    .select({ userId: membersTable.userId })
    .from(membersTable)
    .where(eq(membersTable.userId, id))
    .limit(1);
  if (!member) return `Member ID '${id}' is not a recognised household member`;
  return null;
}

// GET /joint-account — returns balance + all transactions ordered newest first
router.get("/joint-account", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const txs = await db
    .select()
    .from(jointAccountTxTable)
    .orderBy(sql`${jointAccountTxTable.date} DESC, ${jointAccountTxTable.createdAt} DESC`);

  const enriched = await Promise.all(txs.map(enrichTx));

  const totalDeposits = txs.filter(t => t.type === "deposit").reduce((s, t) => s + t.amount, 0);
  const totalDisbursements = txs.filter(t => t.type === "disbursement").reduce((s, t) => s + t.amount, 0);
  const balance = totalDeposits - totalDisbursements;

  res.json({ balance, totalDeposits, totalDisbursements, transactions: enriched });
});

// POST /joint-account/deposit
router.post("/joint-account/deposit", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = DepositInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const { amount, description, date, incomeSourceId } = parsed.data;
  // Explicit null or omitted → Joint bank (null). Never fall back to req.user.
  const madeById = parsed.data.madeById ?? null;

  if (madeById !== null) {
    const err = await validateMemberId(madeById);
    if (err) { res.status(400).json({ error: err }); return; }
  }

  const [tx] = await db
    .insert(jointAccountTxTable)
    .values({ type: "deposit", amount, description, date, madeById, incomeSourceId: incomeSourceId ?? null })
    .returning();

  res.status(201).json(await enrichTx(tx));
});

// POST /joint-account/disbursement
router.post("/joint-account/disbursement", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = DisbursementInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const { amount, description, date, expenseCategory } = parsed.data;
  // Explicit null or omitted → Joint bank (null). Never fall back to req.user.
  const madeById = parsed.data.madeById ?? null;

  if (madeById !== null) {
    const err = await validateMemberId(madeById);
    if (err) { res.status(400).json({ error: err }); return; }
  }

  const [category] = await db
    .select({ id: budgetCategoriesTable.id })
    .from(budgetCategoriesTable)
    .where(eq(budgetCategoriesTable.name, expenseCategory))
    .limit(1);
  if (!category) {
    res.status(400).json({ error: "Choose a valid budget category." });
    return;
  }

  const [tx] = await db
    .insert(jointAccountTxTable)
    .values({
      type: "disbursement",
      amount,
      // Description is a supporting note. When omitted, retain a meaningful
      // non-null value while reports remain anchored on expenseCategory.
      description: description || expenseCategory,
      date,
      madeById,
      expenseCategory,
    })
    .returning();

  res.status(201).json(await enrichTx(tx));
});

// PUT /joint-account/:id — edit a transaction without changing its type.
router.put("/joint-account/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = IdParam.safeParse(req.params);
  const parsed = UpdateJointAccountInput.safeParse(req.body);
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const [existing] = await db
    .select()
    .from(jointAccountTxTable)
    .where(eq(jointAccountTxTable.id, params.data.id))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const { amount, date } = parsed.data;
  const madeById = parsed.data.madeById === undefined ? existing.madeById : parsed.data.madeById;
  if (madeById !== null) {
    const err = await validateMemberId(madeById);
    if (err) { res.status(400).json({ error: err }); return; }
  }

  if (existing.type === "deposit") {
    const description = parsed.data.description ?? existing.description;
    if (!description) { res.status(400).json({ error: "A deposit description is required." }); return; }
    const incomeSourceId = parsed.data.incomeSourceId === undefined
      ? existing.incomeSourceId
      : parsed.data.incomeSourceId;
    const [updated] = await db
      .update(jointAccountTxTable)
      .set({ amount, date, madeById, description, incomeSourceId, expenseCategory: null })
      .where(eq(jointAccountTxTable.id, existing.id))
      .returning();
    res.json(await enrichTx(updated));
    return;
  }

  const expenseCategory = parsed.data.expenseCategory ?? existing.expenseCategory;
  if (!expenseCategory) {
    res.status(400).json({ error: "Choose a valid budget category." });
    return;
  }
  const [category] = await db
    .select({ id: budgetCategoriesTable.id })
    .from(budgetCategoriesTable)
    .where(eq(budgetCategoriesTable.name, expenseCategory))
    .limit(1);
  if (!category) {
    res.status(400).json({ error: "Choose a valid budget category." });
    return;
  }

  const description = parsed.data.description === undefined
    ? existing.description
    : parsed.data.description || expenseCategory;
  const [updated] = await db
    .update(jointAccountTxTable)
    .set({ amount, date, madeById, description, expenseCategory })
    .where(eq(jointAccountTxTable.id, existing.id))
    .returning();
  res.json(await enrichTx(updated));
});

// DELETE /joint-account/:id
router.delete("/joint-account/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = IdParam.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .delete(jointAccountTxTable)
    .where(eq(jointAccountTxTable.id, parsed.data.id))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ success: true });
});

export default router;
