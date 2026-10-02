import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { chooseIncomeSource, isConfirmedToSave, reviewStatus, type Choice, type PreviewLine } from '@/lib/mpesaImport';
import { otherBudgetToMark, toMarkAfterSave } from '@/lib/entriesToSort';
import { savePosting, type PostingApi } from '@/lib/savePosting';

const line = (index: number, over: Partial<PreviewLine> = {}): PreviewLine => ({
  index, status: 'ready', reason: null, receipt: `R${index}`, direction: 'in', type: 'person_receipt',
  amount: 100, description: 'Somebody', date: '2026-01-04', fee: 0, mpesaBalance: null, alreadyRecorded: null, ...over,
});

// Asked for 2 Oct 2026: "all the not sure options need to have a notification
// to be sorted without having necessarily to tick the box".
describe('choosing Not sure is an answer', () => {
  it('confirms the line, so it saves and is brought back to sort out - no Confirm tick', () => {
    const before: Record<number, Choice> = { 1: { include: true, category: '' } };
    expect(reviewStatus(line(1), before[1])).toBe('suggested');
    const after = chooseIncomeSource([line(1)], before, 1, null);
    expect(after[1]).toMatchObject({ incomeSourceId: null, confirmed: true });
    expect(isConfirmedToSave(line(1), after[1])).toBe(true);
    expect(toMarkAfterSave([line(1)], after, new Map([[1, 11]]), true)).toEqual([11]);
  });

  it('choosing a source does not confirm the other lines it fills in', () => {
    const lines = [line(1), line(2)];
    const after = chooseIncomeSource(lines, { 1: { include: true, category: '' }, 2: { include: true, category: '' } }, 1, 7);
    expect(after[2]).toMatchObject({ incomeSourceId: 7, sourceAuto: true });
    expect(after[2].confirmed).toBeUndefined();
  });
});

describe('Not sure on money sent to another budget', () => {
  it('keeps what was made there, and marks it in that budget', async () => {
    const api = { otherBudget: vi.fn().mockResolvedValue({ id: 55 }), disbursement: vi.fn() } as unknown as PostingApi;
    const posted = await savePosting({ kind: 'other-budget', groupId: 7, direction: 'in', main: {}, fee: null } as never, api, 1);
    expect(posted.otherBudget).toEqual({ groupId: 7, id: 55 });
    const choices: Record<number, Choice> = {
      1: { include: true, category: '', otherBudget: { groupId: 7, groupName: 'Chama', accountId: 70, accountName: 'M-Pesa', incomeSourceId: null } },
      2: { include: true, category: '', otherBudget: { groupId: 7, groupName: 'Chama', accountId: 70, accountName: 'M-Pesa', incomeSourceId: 3 } },
    };
    const made = new Map([[1, { groupId: 7, id: 55 }], [2, { groupId: 7, id: 56 }]]);
    expect([...otherBudgetToMark([line(1), line(2)], choices, made)]).toEqual([[7, [55]]]);
  });

  it('is sent to that budget from both import screens, and the web has a Not sure choice', () => {
    for (const path of ['app/mpesa-import.tsx', '../family-budget/src/pages/mpesa-import.tsx']) {
      const screen = readFileSync(path, 'utf8');
      expect(screen).toContain('otherBudgetToMark(lines, choices, otherBudgetMade)');
      expect(screen).toMatch(/'x-jamvi-workspace': String\(groupId\)|"x-jamvi-workspace": String\(groupId\)/);
    }
    expect(readFileSync('../family-budget/src/pages/mpesa-import.tsx', 'utf8')).toContain('<option value={NOT_SURE_SOURCE}>Not sure - sort it out later</option>');
  });
});

// Asked for 2 Oct 2026: "anything Jamvi has not preselected to be under not sure yet".
describe('money out Jamvi cannot place starts on Not sure yet', () => {
  it('as a suggestion that waits to be confirmed, and Fuliza is left alone', async () => {
    const { initialChoices } = await import('@/lib/mpesaImport');
    const out = line(1, { direction: 'out', type: 'paybill_payment', description: 'Nobody known' });
    const fuliza = line(2, { direction: 'out', type: 'fuliza_repaid', description: 'Fuliza' });
    const choices = initialChoices([out, fuliza], [], ['Food']);
    expect(choices[1]).toMatchObject({ category: 'Not sure yet', auto: true });
    expect(reviewStatus(out, choices[1])).toBe('suggested');
    expect(isConfirmedToSave(out, choices[1])).toBe(false);
    expect(choices[2].category).toBe('');
  });
});
