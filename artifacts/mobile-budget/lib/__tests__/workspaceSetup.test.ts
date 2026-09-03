import { describe, expect, it } from 'vitest';
import {
  deriveWorkspaceSetup,
  firstIncompleteWorkspaceSetupStep,
  workspaceSetupStorageKey,
} from '../workspaceSetup';

describe('workspace setup', () => {
  it('requires a real positively planned category, not Uncategorized', () => {
    const steps = deriveWorkspaceSetup({
      isShared: false,
      categories: [{ name: 'Uncategorized', budgetAmount: 5000 }, { name: 'Food', budgetAmount: 0 }],
      incomeSources: [], bankAccounts: [], goals: [], members: [],
    });
    expect(steps[0].complete).toBe(false);
    expect(firstIncompleteWorkspaceSetupStep(steps)?.id).toBe('budget');
  });

  it('selects the first unfinished setup step in the required order', () => {
    const steps = deriveWorkspaceSetup({
      isShared: true,
      categories: [{ name: 'Food', budgetAmount: 12000 }],
      incomeSources: [{}],
      bankAccounts: [{}],
      goals: [],
      members: [{}],
    });
    expect(steps.map((step) => step.id)).toEqual(['budget', 'income', 'bank', 'goals', 'invite']);
    expect(firstIncompleteWorkspaceSetupStep(steps)?.id).toBe('goals');
    expect(steps[4].complete).toBe(false);
  });

  it('does not include invitations for Personal budgets and completes shared invitations at two members', () => {
    const completePersonal = deriveWorkspaceSetup({
      isShared: false, categories: [{ name: 'Rent', budgetAmount: 1 }], incomeSources: [{}], bankAccounts: [{}], goals: [{}], members: [{}],
    });
    const completeShared = deriveWorkspaceSetup({
      isShared: true, categories: [{ name: 'Rent', budgetAmount: 1 }], incomeSources: [{}], bankAccounts: [{}], goals: [{}], members: [{}, {}],
    });
    expect(firstIncompleteWorkspaceSetupStep(completePersonal)).toBeNull();
    expect(firstIncompleteWorkspaceSetupStep(completeShared)).toBeNull();
  });

  it('uses a workspace-scoped stable collapse storage key', () => {
    expect(workspaceSetupStorageKey(42)).toBe('jamvi:workspace-setup-collapsed:42');
    expect(workspaceSetupStorageKey('a/b')).toBe('jamvi:workspace-setup-collapsed:a/b');
    expect(workspaceSetupStorageKey(42)).not.toBe(workspaceSetupStorageKey(43));
  });
});