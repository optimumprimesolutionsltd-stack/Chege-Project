import { Router } from "express";
import { db } from "@workspace/db";
import { expensesTable, usersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import {
  CreateExpenseBody,
  DeleteExpenseParams,
  GetExpensesQueryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/expenses", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = GetExpensesQueryParams.safeParse(req.query);
  const { month, year, category } = parsed.success ? parsed.data : {};

  const conditions = [];
  if (month !== undefined && year !== undefined) {
    conditions.push(
      sql`EXTRACT(MONTH FROM ${expensesTable.date}) = ${month}`,
      sql`EXTRACT(YEAR FROM ${expensesTable.date}) = ${year}`,
    );
  } else if (year !== undefined) {
    conditions.push(sql`EXTRACT(YEAR FROM ${expensesTable.date}) = ${year}`);
  }
  if (category) {
    conditions.push(eq(expensesTable.category, category));
  }

  const expenses = await db
    .select({
      id: expensesTable.id,
      amount: expensesTable.amount,
      category: expensesTable.category,
      description: expensesTable.description,
      paidById: expensesTable.paidById,
      paidByName: usersTable.firstName,
      date: expensesTable.date,
      createdAt: expensesTable.createdAt,
    })
    .from(expensesTable)
    .leftJoin(usersTable, eq(expensesTable.paidById, usersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${expensesTable.date} DESC, ${expensesTable.createdAt} DESC`);

  res.json(
    expenses.map((e) => ({
      ...e,
      paidByName: e.paidByName ?? "Unknown",
      date: typeof e.date === "string" ? e.date : e.date?.toISOString().split("T")[0],
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
    })),
  );
});

router.post("/expenses", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = CreateExpenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { amount, category, description, date } = parsed.data;
  const [expense] = await db
    .insert(expensesTable)
    .values({
      amount,
      category,
      description,
      paidById: req.user.id,
      date,
    })
    .returning();

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, req.user.id),
  });

  res.status(201).json({
    ...expense,
    paidByName: user?.firstName ?? "Unknown",
    date: typeof expense.date === "string" ? expense.date : expense.date?.toISOString().split("T")[0],
    createdAt: expense.createdAt instanceof Date ? expense.createdAt.toISOString() : expense.createdAt,
  });
});

router.delete("/expenses/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = DeleteExpenseParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const id = Math.round(parsed.data.id);
  const [deleted] = await db
    .delete(expensesTable)
    .where(eq(expensesTable.id, id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({ success: true });
});

export default router;
