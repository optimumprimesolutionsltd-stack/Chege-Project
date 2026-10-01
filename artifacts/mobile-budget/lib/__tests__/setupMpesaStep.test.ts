import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deriveWorkspaceSetup } from '@/lib/workspaceSetup';

const base = { categories: [{ name: 'Rent', budgetAmount: 1 }], incomeSources: [{}], bankAccounts: [{}], goals: [{}], members: [{}] };

// The headline feature belongs in the setup checklist of every new budget.
describe('the setup checklist asks for an M-Pesa import', () => {
  it('in a Personal budget and a group, right after the bank account', () => {
    for (const isShared of [false, true]) {
      const ids = deriveWorkspaceSetup({ ...base, isShared }).map((step) => step.id);
      expect(ids.indexOf('mpesa')).toBe(ids.indexOf('bank') + 1);
    }
  });

  it('opens the import, and ticks once something is saved from M-Pesa', () => {
    const open = deriveWorkspaceSetup({ ...base, isShared: false }).find((step) => step.id === 'mpesa');
    expect(open).toMatchObject({ route: '/mpesa-import', complete: false });
    expect(deriveWorkspaceSetup({ ...base, isShared: false, mpesaImported: true }).find((step) => step.id === 'mpesa')?.complete).toBe(true);
  });

  it('is asked of the server, so an import on another device counts', () => {
    expect(readFileSync('components/WorkspaceSetupGuide.tsx', 'utf8')).toContain("customFetch<{ imported: boolean }>('/api/mpesa/import/status')");
  });
});
