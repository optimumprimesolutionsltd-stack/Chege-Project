import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { groupContributionDeposit, mayBeGroupContribution, type Choice, type PreviewLine } from '../mpesaImport';

// "How do you differentiate my salary and business profits from chama money /
// contributions ... so we fix the issue" (16 Oct 2026): a contribution paid
// from your own M-Pesa is your money out here AND the group's money in there.
const line = (description: string, direction: 'in' | 'out' = 'out'): PreviewLine => ({
  index: 1, status: 'ready', reason: null, receipt: 'TJK12AB34C', direction, type: 'paybill_payment', amount: 2000,
  description, date: '2026-10-15', fee: null, mpesaBalance: null, alreadyRecorded: null,
});
const filed = (category: string, extra: Partial<Choice> = {}): Choice => ({ include: true, category, ...extra });

describe('a payment that may be your contribution to a group', () => {
  it('is money out to a chama-like payee, or filed under a chama category', () => {
    expect(mayBeGroupContribution(line('UMOJA WOMEN CHAMA'), filed('Not sure yet'))).toBe(true);
    expect(mayBeGroupContribution(line('KPLC PREPAID'), filed('Chama contributions'))).toBe(true);
    expect(mayBeGroupContribution(line('KPLC PREPAID'), filed('Electricity'))).toBe(false);
  });

  it('never money in, a line left out, or one moved elsewhere', () => {
    expect(mayBeGroupContribution(line('UMOJA CHAMA', 'in'), filed('Chama contributions'))).toBe(false);
    expect(mayBeGroupContribution(line('UMOJA CHAMA'), filed('Chama contributions', { include: false }))).toBe(false);
    expect(mayBeGroupContribution(line('UMOJA CHAMA'), filed('', { savingsGoalId: 4 }))).toBe(false);
  });
});

describe('recorded in the group too, under your name', () => {
  it('is a deposit of the same amount and M-Pesa code, attributed to you', () => {
    const choice = filed('Chama contributions', { alsoContribution: { groupId: 9, groupName: 'Umoja', accountId: 31 } });
    expect(groupContributionDeposit(line('UMOJA WOMEN CHAMA'), choice, 'user-1')).toEqual({
      groupId: 9,
      body: {
        amount: 2000,
        description: 'Contribution - UMOJA WOMEN CHAMA',
        date: '2026-10-15',
        accountId: 31,
        contributorSplits: [{ userId: 'user-1', amount: 2000 }],
        mpesaReceipt: 'TJK12AB34C',
      },
    });
  });

  it('is nothing when no group was picked', () => {
    expect(groupContributionDeposit(line('UMOJA CHAMA'), filed('Chama contributions'), 'user-1')).toBeNull();
  });

  it('is offered from a Personal budget only, sent to that group after the save, and a code it has already is not counted twice', () => {
    const screen = readFileSync('app/mpesa-import.tsx', 'utf8');
    expect(screen).toContain("const myGroups = group?.isPrivate === true ? (workspaces as Workspace[]).filter((workspace) => !workspace.isPrivate) : [];");
    expect(screen).toContain('{myGroups.length > 0 && choice && mayBeGroupContribution(item, choice) ? (');
    expect(screen).toContain("headers: { 'Content-Type': 'application/json', 'x-jamvi-workspace': String(deposit.groupId) },");
    expect(screen).toContain('result.reason instanceof ApiError && result.reason.status === 409');
  });
});
