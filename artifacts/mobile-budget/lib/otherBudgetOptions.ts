import { getBudgetCategories, getIncomeSources, getJointAccounts, type BudgetCategory } from '@workspace/api-client-react';

export type OtherBudgetOptions = {
  accounts: Array<{ id: number; name: string }>;
  /** Leaf categories only: a heading carries no figure of its own, so it is never a valid destination. */
  categories: string[];
  incomeSources: Array<{ id: number; name: string; userId?: string | null }>;
};

/** Every request here names the target budget explicitly, so it never depends on — or disturbs — whichever budget is currently active. */
const forGroup = (groupId: number) => ({ headers: { 'x-jamvi-workspace': String(groupId) } });

const leafNames = (categories: readonly BudgetCategory[]): string[] => {
  const parentIds = new Set(categories.map((category) => category.parentId).filter((id): id is number => id != null));
  return categories.filter((category) => !parentIds.has(category.id)).map((category) => category.name);
};

/**
 * What is needed to record a line in a budget other than the one being worked in, read
 * without switching to it. The M-Pesa import uses this so a side hustle's own project can be
 * picked from partway through reviewing a statement, without leaving the budget on screen.
 */
export async function fetchOtherBudgetOptions(groupId: number): Promise<OtherBudgetOptions> {
  const [accounts, categories, incomeSources] = await Promise.all([
    getJointAccounts(forGroup(groupId)),
    getBudgetCategories(forGroup(groupId)),
    getIncomeSources(undefined, forGroup(groupId)),
  ]);
  return {
    accounts: accounts.map((account) => ({ id: account.id, name: account.name })),
    categories: leafNames(categories),
    incomeSources: incomeSources.map((source) => ({ id: source.id, name: source.name, userId: source.userId })),
  };
}
