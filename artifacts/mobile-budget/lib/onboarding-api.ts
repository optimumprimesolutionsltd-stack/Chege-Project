import {
  ApiError,
  customFetch,
  type Workspace,
} from "@workspace/api-client-react";
import {
  BUSINESS_COST_CATEGORIES,
  businessNameFromDraft,
  categoryPriority,
  onboardingSubcategoriesFor,
  plannedCategoryAmount,
  normalizeCategoryName,
  normalizeIncomeStreamName,
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

export async function saveMobileOnboardingProgress(
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
      completed: false,
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

  // A group treasurer's key setting: what each member owes per month. Applied
  // as the group's default contribution target, onto everyone.
  if (!workspace.isPrivate && canManageCategories) {
    const perMember = Math.max(0, Math.round(Number((draft.memberContribution ?? "").replace(/[^0-9]/g, "")) || 0));
    if (perMember > 0) {
      try {
        await customFetch("/api/contribution-settings", {
          method: "PATCH",
          responseType: "json",
          body: JSON.stringify({ defaultMonthlyTarget: perMember, applyToEveryone: true }),
        });
      } catch {
        // Not fatal to the rest of setup — the treasurer can set it later in
        // Contributions.
      }
    }
  }

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
          plannedAmount: plannedCategoryAmount(draft, name),
          priority: categoryPriority(name),
          isCustom: draft.customCategories.includes(name),
          position,
          // A category is planned only through its subcategories; the server
          // makes each one under it. Sent even when blank, so Food arrives
          // with Groceries and Eating out ready to record into.
          subcategories: onboardingSubcategoriesFor(name, draft).map((child) => ({
            name: child,
            plannedAmount: Math.max(0, Math.round(Number(draft.subcategoryBudgets?.[name]?.[child] ?? 0) || 0)),
          })),
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

  // Cost links are only offered on a Personal budget (Budget's category form
  // clears them in a group), so a business answer waits for that budget.
  if (workspace.isPrivate) {
    try {
      await setUpBusiness({ draft, userId });
    } catch {
      // Not fatal to the rest of setup — Reports' Cost categories can still
      // link the costs by hand.
    }
  }
}

/**
 * The business somebody said they run: an income stream named for it, with
 * the business cost categories they kept linked to it, so the Business
 * screen has a profit and loss from the first sale.
 *
 * Safe to run twice: an existing stream of that name is reused, and a
 * category already linked to something is left alone.
 */
export async function setUpBusiness({
  draft,
  userId,
}: {
  draft: MobileOnboardingDraft;
  userId: string;
}): Promise<void> {
  const name = businessNameFromDraft(draft);
  if (!name) return;

  let incomeSourceId: number | null = null;
  try {
    const created = await customFetch<{ id: number }>("/api/income-sources", {
      method: "POST",
      responseType: "json",
      body: JSON.stringify({
        userId,
        name,
        isMain: false,
        expectedMonthlyAmount: Math.max(0, Math.round(Number(draft.incomeAmounts[name] ?? 0)) || 0),
      }),
    });
    incomeSourceId = created?.id ?? null;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 409) throw error;
  }
  if (incomeSourceId == null) {
    const sources = await customFetch<Array<{ id: number; name: string }>>(`/api/income-sources?userId=${encodeURIComponent(userId)}`, {
      method: "GET",
      responseType: "json",
    });
    incomeSourceId = (sources ?? []).find((source) => normalizeIncomeStreamName(source.name) === normalizeIncomeStreamName(name))?.id ?? null;
  }
  if (incomeSourceId == null) return;

  // Named in My businesses: only a business has costs and a Business report,
  // and is asked once whether you pay yourself a salary from it (8-9 Oct 2026).
  await customFetch(`/api/businesses/${incomeSourceId}`, {
    method: "PUT",
    responseType: "json",
    body: JSON.stringify({ business: true }),
  });

  const categories = await customFetch<Array<{ id: number; name: string; reducesIncomeSourceId?: number | null }>>("/api/budget-categories", {
    method: "GET",
    responseType: "json",
  });
  for (const cost of BUSINESS_COST_CATEGORIES) {
    const category = (categories ?? []).find((row) => normalizeCategoryName(row.name) === normalizeCategoryName(cost.name));
    if (!category || category.reducesIncomeSourceId != null) continue;
    await customFetch(`/api/budget-categories/${category.id}`, {
      method: "PUT",
      responseType: "json",
      body: JSON.stringify({ reducesIncomeSourceId: incomeSourceId, costKind: cost.costKind }),
    });
  }
}
