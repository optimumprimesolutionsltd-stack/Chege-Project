export type WorkspaceSetupStepId = 'budget' | 'income' | 'bank' | 'mpesa' | 'goals' | 'invite';

export type SetupCategory = { name?: string | null; budgetAmount?: number | null };

export type WorkspaceSetupData = {
  categories?: SetupCategory[];
  incomeSources?: unknown[];
  bankAccounts?: unknown[];
  goals?: unknown[];
  members?: unknown[];
  /** Something has been saved from M-Pesa in this workspace. */
  mpesaImported?: boolean;
  isShared: boolean;
};

export type WorkspaceSetupStep = {
  id: WorkspaceSetupStepId;
  title: string;
  action: string;
  route: '/(tabs)/budget' | '/(tabs)/bank' | '/mpesa-import' | '/(tabs)/goals' | '/(tabs)/settings?openInvite=1';
  complete: boolean;
};

export function workspaceSetupStorageKey(workspaceId: string | number): string {
  return `jamvi:workspace-setup-collapsed:${String(workspaceId)}`;
}

export function deriveWorkspaceSetup(data: WorkspaceSetupData): WorkspaceSetupStep[] {
  const hasPlannedCategory = (data.categories ?? []).some((category) =>
    category.name?.trim().toLocaleLowerCase() !== 'uncategorized'
      && (category.budgetAmount ?? 0) > 0,
  );
  const steps: WorkspaceSetupStep[] = [
    { id: 'budget', title: 'Plan your monthly budget', action: 'Set up your budget', route: '/(tabs)/budget', complete: hasPlannedCategory },
    { id: 'income', title: 'Add an income source', action: 'Add income source', route: '/(tabs)/budget', complete: (data.incomeSources?.length ?? 0) > 0 },
    { id: 'bank', title: 'Add a bank account', action: 'Add bank account', route: '/(tabs)/bank', complete: (data.bankAccounts?.length ?? 0) > 0 },
    // Jamvi's headline: a month of M-Pesa filled in, not typed. After the bank
    // step, since an import saves into an account.
    { id: 'mpesa', title: 'Import your M-Pesa', action: 'Import M-Pesa', route: '/mpesa-import', complete: Boolean(data.mpesaImported) },
    { id: 'goals', title: 'Create a savings goal', action: 'Create a savings goal', route: '/(tabs)/goals', complete: (data.goals?.length ?? 0) > 0 },
  ];
  if (data.isShared) {
    steps.push({ id: 'invite', title: 'Invite a member', action: 'Invite a member', route: '/(tabs)/settings?openInvite=1', complete: (data.members?.length ?? 0) > 1 });
  }
  return steps;
}

export function firstIncompleteWorkspaceSetupStep(steps: WorkspaceSetupStep[]): WorkspaceSetupStep | null {
  return steps.find((step) => !step.complete) ?? null;
}