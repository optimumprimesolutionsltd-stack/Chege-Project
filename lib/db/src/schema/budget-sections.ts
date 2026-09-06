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
  club: [BUDGET_SECTION.CONTRIBUTIONS, BUDGET_SECTION.EXPENSES, BUDGET_SECTION.BANK, BUDGET_SECTION.REPORTS, BUDGET_SECTION.ACTIVITY],
  student_group: [BUDGET_SECTION.CONTRIBUTIONS, BUDGET_SECTION.EXPENSES, BUDGET_SECTION.REPORTS, BUDGET_SECTION.ACTIVITY],
  team: ALL_BUDGET_SECTIONS,
  other: ALL_BUDGET_SECTIONS,
};

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
