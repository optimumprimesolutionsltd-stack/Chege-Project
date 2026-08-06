import { Router } from "express";
import { db } from "@workspace/db";
import { contributionsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateContributionBody,
  GetContributionsQueryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/contributions", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = GetContributionsQueryParams.safeParse(req.query);
  const { month, year } = parsed.success ? parsed.data : {};

  const conditions = [];
  if (month !== undefined) conditions.push(eq(contributionsTable.month, Math.round(month)));
  if (year !== undefined) conditions.push(eq(contributionsTable.year, Math.round(year)));

  const contributions = await db
    .select({
      id: contributionsTable.id,
      userId: contributionsTable.userId,
      userName: usersTable.firstName,
      amount: contributionsTable.amount,
      month: contributionsTable.month,
      year: contributionsTable.year,
      note: contributionsTable.note,
      createdAt: contributionsTable.createdAt,
    })
    .from(contributionsTable)
    .leftJoin(usersTable, eq(contributionsTable.userId, usersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(contributionsTable.year, contributionsTable.month, contributionsTable.createdAt);

  res.json(
    contributions.map((c) => ({
      ...c,
      userName: c.userName ?? "Unknown",
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    })),
  );
});

router.post("/contributions", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = CreateContributionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { amount, month, year, note } = parsed.data;
  const [contribution] = await db
    .insert(contributionsTable)
    .values({
      userId: req.user.id,
      amount,
      month: Math.round(month),
      year: Math.round(year),
      note: note ?? null,
    })
    .returning();

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, req.user.id),
  });

  res.status(201).json({
    ...contribution,
    userName: user?.firstName ?? "Unknown",
    createdAt: contribution.createdAt instanceof Date ? contribution.createdAt.toISOString() : contribution.createdAt,
  });
});

export default router;
