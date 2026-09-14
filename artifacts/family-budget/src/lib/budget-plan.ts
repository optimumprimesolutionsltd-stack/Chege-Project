export type BudgetDurationType = "ongoing" | "week" | "month" | "quarter" | "custom";

/** Same labels shown during onboarding, kept in one place so editing a
 *  budget's duration later (Settings) cannot drift from what it meant when
 *  chosen the first time. */
export const BUDGET_DURATION_LABELS: Record<BudgetDurationType, { title: string; description: string }> = {
  ongoing: { title: "Everyday budgeting", description: "For your regular personal or shared money." },
  week: { title: "Up to 1 week", description: "For a short trip, event, or weekly plan." },
  month: { title: "Up to 1 month", description: "For a monthly challenge, project, or trip." },
  quarter: { title: "Up to 3 months", description: "For a school term, campaign, or longer project." },
  custom: { title: "Set an end date", description: "Choose the exact date this budget should finish." },
};

/** Same rule the onboarding wizard applies to its own duration step, reused
 *  so editing a budget's duration later cannot accept what choosing it the
 *  first time would have refused. */
export function budgetDurationEditError(durationType: BudgetDurationType, endDate: string): string | null {
  if (durationType !== "custom") return null;
  if (!endDate) return "Choose an end date for this budget.";
  if (endDate <= new Date().toISOString().slice(0, 10)) return "Choose an end date in the future.";
  return null;
}
