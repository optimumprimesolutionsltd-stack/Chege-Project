export type BudgetDurationType = "ongoing" | "week" | "month" | "quarter" | "custom";

/**
 * Same labels used by the onboarding wizard and, later, the Settings edit
 * card — one definition so the two cannot drift from what the duration
 * meant when it was chosen.
 *
 * Parameterized on `isShared` because "budgeting" is the right word for a
 * personal account and the wrong one for a chama or church, which thinks in
 * contributions and spending rather than a personal spending plan. Only the
 * "ongoing" entry actually depends on this; the rest are duration-only and
 * read fine either way.
 */
export function budgetDurationLabels(isShared: boolean): Record<BudgetDurationType, { title: string; description: string }> {
  return {
    ongoing: isShared
      ? { title: "Everyday contributions", description: "For the group's regular contributions and spending." }
      : { title: "Everyday budgeting", description: "For your regular personal money." },
    week: { title: "Up to 1 week", description: "For a short trip, event, or weekly plan." },
    month: { title: "Up to 1 month", description: "For a monthly challenge, project, or trip." },
    quarter: { title: "Up to 3 months", description: "For a school term, campaign, or longer project." },
    custom: { title: "Set an end date", description: "Choose the exact date this budget should finish." },
  };
}

/** Same rule the onboarding wizard applies to its own duration step, reused
 *  so editing a budget's duration later cannot accept what choosing it the
 *  first time would have refused. */
export function budgetDurationEditError(durationType: BudgetDurationType, endDate: string): string | null {
  if (durationType !== "custom") return null;
  if (!endDate) return "Choose an end date for this budget.";
  if (endDate <= new Date().toISOString().slice(0, 10)) return "Choose an end date in the future.";
  return null;
}
