import { Router } from "express";
import { db, onboardingPreferencesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

router.put("/onboarding/preferences", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = onboardingPreferencesSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid onboarding preferences.", details: parsed.error.flatten() }); return; }
  const values = {
    userId: req.user!.id,
    usageMode: parsed.data.usageMode,
    persona: parsed.data.persona ?? null,
    budgetDuration: parsed.data.budgetDuration,
    budgetStartDate: parsed.data.budgetStartDate ?? null,
    budgetEndDate: parsed.data.budgetEndDate ?? null,
    categoryNames: parsed.data.categoryNames,
    incomeStreams: parsed.data.incomeStreams,
    completed: parsed.data.completed,
    onboardingVersion: parsed.data.onboardingVersion,
    updatedAt: new Date(),
  };
  const [preferences] = await db.insert(onboardingPreferencesTable).values(values).onConflictDoUpdate({ target: onboardingPreferencesTable.userId, set: values }).returning();
  res.json(preferences);
});

export default router;
