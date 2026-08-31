import { Router } from "express";
import { db, onboardingPreferencesTable, budgetCategoriesTable, groupMembershipsTable, groupsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const onboardingPreferencesSchema = z.object({
  usageMode: z.enum(["personal", "shared", "both"]),
  persona: z.string().trim().min(1).max(40).nullable().optional(),
  budgetDuration: z.enum(["ongoing", "week", "month", "quarter", "custom"]),
  budgetStartDate: z.string().date().nullable().optional(),
  budgetEndDate: z.string().date().nullable().optional(),
  categoryNames: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  incomeStreams: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  completed: z.boolean().default(false),
  onboardingVersion: z.number().int().min(1).max(100).default(1),
}).superRefine((value, context) => {
  if (value.budgetDuration === "custom" && !value.budgetEndDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["budgetEndDate"], message: "A custom budget requires an end date." });
  }
});

router.get("/onboarding/preferences", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [preferences] = await db.select().from(onboardingPreferencesTable).where(eq(onboardingPreferencesTable.userId, req.user!.id)).limit(1);
  res.json(preferences ?? null);
});

router.get("/onboarding/duplicate-categories", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const targetGroupId = z.coerce.number().int().positive().safeParse(req.query.groupId);
  if (!targetGroupId.success) { res.status(400).json({ error: "A valid Shared budget is required." }); return; }
  const [targetMembership] = await db.select({ groupId: groupMembershipsTable.groupId }).from(groupMembershipsTable).where(and(eq(groupMembershipsTable.groupId, targetGroupId.data), eq(groupMembershipsTable.userId, req.user!.id))).limit(1);
  if (!targetMembership) { res.status(403).json({ error: "You are not a member of that Shared budget." }); return; }
  const [personal] = await db.select({ id: groupsTable.id }).from(groupsTable).where(eq(groupsTable.privateOwnerUserId, req.user!.id)).limit(1);
  if (!personal) { res.json({ duplicates: [] }); return; }
  const personalCategories = await db.select({ name: budgetCategoriesTable.name }).from(budgetCategoriesTable).where(eq(budgetCategoriesTable.groupId, personal.id));
  const sharedCategories = await db.select({ name: budgetCategoriesTable.name }).from(budgetCategoriesTable).where(eq(budgetCategoriesTable.groupId, targetGroupId.data));
  const sharedNames = new Set(sharedCategories.map(({ name }) => name.trim().toLocaleLowerCase("en-US")));
  res.json({ duplicates: personalCategories.map(({ name }) => name).filter((name) => !sharedNames.has(name.trim().toLocaleLowerCase("en-US")) && name !== "Uncategorized") });
});

router.put("/onboarding/preferences", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = onboardingPreferencesSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid onboarding preferences.", details: parsed.error.flatten() }); return; }
  const values = { userId: req.user!.id, usageMode: parsed.data.usageMode, persona: parsed.data.persona ?? null, budgetDuration: parsed.data.budgetDuration, budgetStartDate: parsed.data.budgetStartDate ?? null, budgetEndDate: parsed.data.budgetEndDate ?? null, categoryNames: parsed.data.categoryNames, incomeStreams: parsed.data.incomeStreams, completed: parsed.data.completed, onboardingVersion: parsed.data.onboardingVersion, updatedAt: new Date() };
  const [preferences] = await db.insert(onboardingPreferencesTable).values(values).onConflictDoUpdate({ target: onboardingPreferencesTable.userId, set: values }).returning();
  res.json(preferences);
});

export default router;
