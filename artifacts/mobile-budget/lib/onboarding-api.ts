import {
  ApiError,
  customFetch,
  type Workspace,
} from "@workspace/api-client-react";
import {
  categoryPriority,
  type MobileOnboardingDraft,
} from "@/lib/onboarding";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function saveMobileOnboardingPreferences(
  draft: MobileOnboardingDraft,
): Promise<void> {
  await customFetch("/api/onboarding/preferences", {
    method: "PUT",
    responseType: "json",
    body: JSON.stringify({
      usageMode: draft.usageMode,
      persona: draft.persona,
      budgetDuration: draft.budgetDuration,
      budgetStartDate: today(),
      budgetEndDate: draft.budgetDuration === "custom" ? draft.customEndDate : null,
      categoryNames: draft.selectedCategories,
      incomeStreams: draft.selectedIncomeStreams,
      completed: true,
      onboardingVersion: 1,
    }),
  });
}

export async function applyMobileOnboardingToWorkspace({
  workspace,
  draft,
  userId,
}: {
  workspace: Workspace;
  draft: MobileOnboardingDraft;
  userId: string;
}): Promise<void> {
  const canManageCategories = workspace.isPrivate || workspace.role === "owner" || workspace.role === "admin";

  if (canManageCategories && draft.selectedCategories.length > 0) {
    await customFetch("/api/budget-plans/onboarding", {
      method: "POST",
      responseType: "json",
      body: JSON.stringify({
        name: draft.persona ? `${draft.persona} budget` : "My budget",
        purpose: draft.persona,
        durationType: draft.budgetDuration,
        startDate: today(),
        endDate: draft.budgetDuration === "custom" ? draft.customEndDate : null,
        categories: draft.selectedCategories.map((name, position) => ({
          name,
          plannedAmount: Math.max(0, Math.round(Number(draft.categoryBudgets[name] ?? 0))),
          priority: categoryPriority(name),
          isCustom: draft.customCategories.includes(name),
          position,
        })),
      }),
    });
  }

  for (const name of draft.selectedIncomeStreams) {
    try {
      await customFetch("/api/income-sources", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({
          userId,
          name,
          isMain: false,
          expectedMonthlyAmount: Math.max(0, Math.round(Number(draft.incomeAmounts[name] ?? 0))),
        }),
      });
    } catch (error) {
      // The web flow treats a duplicate income source as an idempotent retry.
      if (!(error instanceof ApiError) || error.status !== 409) throw error;
    }
  }
}
