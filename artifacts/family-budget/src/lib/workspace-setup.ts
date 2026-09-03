export type WorkspaceSetupStepId = "budget" | "income" | "bank" | "goals" | "invite";

export type WorkspaceSetupStep = {
  id: WorkspaceSetupStepId;
  title: string;
  description: string;
  route: string;
  action: string;
  complete: boolean;
};

type Category = { name: string; budgetAmount: number };

export function getWorkspaceSetupStorageKey(workspaceId: number) {
  return `jamvi:workspace-setup-collapsed:${workspaceId}`;
}

export function getWorkspaceSetupSteps({
  isShared,
  categories,
  incomeSources,
  bankAccounts,
  goals,
  memberCount,
}: {
  isShared: boolean;
  categories: Category[];
  incomeSources: unknown[];
  bankAccounts: unknown[];
  goals: unknown[];
  memberCount: number;
}): WorkspaceSetupStep[] {
  const hasBudget = categories.some(
    (category) =>
      category.name.trim().toLocaleLowerCase() !== "uncategorized" &&
      Number(category.budgetAmount) > 0,
  );
  const steps: WorkspaceSetupStep[] = [
    { id: "budget", title: "Plan your monthly budget", description: "Add a category with a planned amount.", route: "/budget", action: "Plan monthly budget", complete: hasBudget },
    { id: "income", title: "Add an income source", description: "Record where your monthly income comes from.", route: "/budget", action: "Add income source", complete: incomeSources.length > 0 },
    { id: "bank", title: "Add a bank account", description: "Keep the money you track in one place.", route: "/bank", action: "Add bank account", complete: bankAccounts.length > 0 },
    { id: "goals", title: "Create a savings goal", description: "Set something meaningful to save toward.", route: "/savings-goals", action: "Create savings goal", complete: goals.length > 0 },
  ];
  if (isShared) {
    steps.push({ id: "invite", title: "Invite a member", description: "Bring another person into this shared budget.", route: "/settings", action: "Invite a member", complete: memberCount > 1 });
  }
  return steps;
}

export function getFirstIncompleteSetupStep(steps: WorkspaceSetupStep[]) {
  return steps.find((step) => !step.complete) ?? null;
}