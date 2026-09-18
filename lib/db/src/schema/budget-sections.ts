/**
 * Which parts of Jamvi a budget uses.
 *
 * A chama that only collects money should see one tab, not nine. The mandate
 * is usually implied by what the group said it was when it was created, so the
 * kind seeds this and most groups never open the setting at all.
 */

export const BUDGET_SECTION = {
  CONTRIBUTIONS: "contributions",
  EXPENSES: "expenses",
  BUDGET: "budget",
  ACTIVITY: "activity",
  GOALS: "goals",
  BANK: "bank",
  REPORTS: "reports",
} as const;

export type BudgetSection = (typeof BUDGET_SECTION)[keyof typeof BUDGET_SECTION];

export const ALL_BUDGET_SECTIONS: readonly BudgetSection[] = Object.values(BUDGET_SECTION);

/**
 * Sections nobody can switch off.
 *
 * Settings is how you switch things back on, and Subscription is how you keep
 * paying for the app. Hiding either one strands an admin outside their own
 * budget with no way in, so neither is offered as a choice.
 */
export const ALWAYS_ON_PATHS = ["/", "/search", "/subscription", "/settings"] as const;

/**
 * What each kind of group starts with.
 *
 * A chama collects and reports; it does not usually keep a household budget. A
 * family does the opposite. These are only defaults - any group can change
 * them, and changing them is reversible because nothing is deleted.
 */
const DEFAULTS: Record<string, readonly BudgetSection[]> = {
  personal: ALL_BUDGET_SECTIONS,
  family: ALL_BUDGET_SECTIONS,
  chama: [BUDGET_SECTION.CONTRIBUTIONS, BUDGET_SECTION.BANK, BUDGET_SECTION.REPORTS, BUDGET_SECTION.ACTIVITY],
  church: [BUDGET_SECTION.CONTRIBUTIONS, BUDGET_SECTION.EXPENSES, BUDGET_SECTION.BANK, BUDGET_SECTION.REPORTS, BUDGET_SECTION.ACTIVITY],
  // A club plans a year - so much for events, so much for equipment - which is
  // what budget categories are for. Cutting them was pattern-matching a club
  // to a chama; a club is a small organisation and gets the full set.
  club: ALL_BUDGET_SECTIONS,
  // Bank was missing here, which was simply wrong. The group account is where
  // the treasurer's balance lives, and hiding it hides the number the group
  // most wants to see.
  student_group: [
    BUDGET_SECTION.CONTRIBUTIONS,
    BUDGET_SECTION.EXPENSES,
    BUDGET_SECTION.BANK,
    BUDGET_SECTION.REPORTS,
    BUDGET_SECTION.ACTIVITY,
  ],
  team: ALL_BUDGET_SECTIONS,
  other: ALL_BUDGET_SECTIONS,
};

/**
 * What a budget is mainly for, as answered during onboarding.
 *
 * Mirrors BudgetGoal in the mobile client; kept here because the sections a
 * budget starts with are decided from it and both sides need the same rule.
 */
export type BudgetPurpose = "budgeting" | "saving" | "debt";

/**
 * Whether budgeting applies, given what the budget is for.
 *
 * Budgeting without amounts is worse than no budgeting: the tab reads
 * "KES 0 of KES 0 (0%)", every category looks on track, and the over-budget
 * warnings mean nothing — the app looks broken rather than empty. Somebody
 * here to save towards something, or to clear a loan, is not going to sit down
 * and set a monthly ceiling per category, so offering them the machinery is
 * offering them that failure.
 *
 * Off is not permanent. The setting is one switch, and a budget that later
 * gains an actual amount surfaces the tab on its own — the same way the Debt
 * tab appears once a debt is tracked. Nobody is trapped by an answer they gave
 * before they knew what the app did.
 */
export function budgetingAppliesTo(purpose: BudgetPurpose | null | undefined): boolean {
  return purpose !== "saving" && purpose !== "debt";
}

/**
 * The sections a new budget starts with, once its purpose is known. Purpose
 * only ever removes budgeting; everything else the kind decided still stands,
 * so a chama that never had the budget section is unaffected either way.
 */
export function sectionsForKindAndPurpose(
  kind: string | null | undefined,
  purpose: BudgetPurpose | null | undefined,
): readonly BudgetSection[] {
  const fromKind = defaultSectionsForKind(kind);
  if (budgetingAppliesTo(purpose)) return fromKind;
  return fromKind.filter((section) => section !== BUDGET_SECTION.BUDGET);
}

export function defaultSectionsForKind(kind: string | null | undefined): readonly BudgetSection[] {
  return DEFAULTS[kind ?? ""] ?? ALL_BUDGET_SECTIONS;
}

/**
 * The sections a budget uses, given what is stored on it.
 *
 * Null means everything, which is what every budget created before this
 * existed gets - so nothing changes for anybody on migration. An empty list
 * also means everything rather than nothing: a budget with no sections at all
 * would be a budget nobody can use, and that is never what somebody meant.
 */
export function resolveEnabledSections(stored: unknown): readonly BudgetSection[] {
  if (!Array.isArray(stored)) return ALL_BUDGET_SECTIONS;
  const known = stored.filter(
    (value): value is BudgetSection => ALL_BUDGET_SECTIONS.includes(value as BudgetSection),
  );
  return known.length > 0 ? known : ALL_BUDGET_SECTIONS;
}

export function isSectionEnabled(stored: unknown, section: BudgetSection): boolean {
  return resolveEnabledSections(stored).includes(section);
}
