import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sameParty, type EntryToSort } from '../entriesToSort';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// "On one side it increases M-Pesa but on the other it does not show a true
// picture of income" (4 Oct 2026): money in was never asked where it came from
// in a budget with no income sources, and a whole year was saved that way.
describe('money in always asks where it came from', () => {
  const importScreen = read('app/mpesa-import.tsx');

  it('on every plain money-in line, not hidden under More, and whether or not there are sources yet', () => {
    const row = importScreen.indexOf('testID={`mpesa-line-source-${item.index}`}');
    const more = importScreen.indexOf("{openMore.has(item.index) || destinationOf(choice) !== 'category' || transferHints.has(item.index) ? (");
    expect(row).toBeGreaterThan(0);
    expect(row).toBeLessThan(more);
    expect(importScreen).toContain("{item.direction === 'in' && choice?.include && !choice.debt && !isMove(choice) && !choice.contributorId && destinationOf(choice) === 'category' && !item.type?.startsWith('fuliza_') && item.type !== 'reversal' ? (");
    expect(importScreen).not.toContain('!choice.contributorId && incomeSources.length > 0 ? (');
  });

  it('offers Not sure yet and a new source on the spot', () => {
    expect(importScreen).toContain("{[{ id: null as number | null, name: 'Not sure yet' }, ...incomeSources].map((source) => {");
    expect(importScreen).toContain('testID={`mpesa-line-source-add-${item.index}`}');
    expect(importScreen).toContain('Home will remind you to say where it came from.');
  });

  it('the add chip makes a source owned by the person, and refreshes every list of sources', () => {
    const chip = read('components/AddIncomeSourceChip.tsx');
    expect(chip).toContain("customFetch<Created>('/api/income-sources', {");
    expect(chip).toContain('body: JSON.stringify({ userId: user.id, name: trimmed }),');
    expect(chip).toContain("return head === 'income-sources' || (typeof head === 'string' && head.startsWith('/api/income-sources'));");
  });
});

describe('Sort them out, for a year already saved', () => {
  const entry = (id: number, description: string, direction: 'in' | 'out' = 'in'): EntryToSort =>
    ({ id, type: direction === 'in' ? 'deposit' : 'disbursement', direction, amount: 100, date: '2026-10-01', description });

  it('finds the other entries from the same payer, the same way', () => {
    const entries = [
      entry(1, 'Received from Victor Akwir'),
      entry(2, 'Received from VICTOR AKWIR'),
      entry(3, 'Received from Wallace Mutalia'),
      entry(4, 'Sent to Victor Akwir', 'out'),
    ];
    expect(sameParty(entries, entries[0]).map((other) => other.id)).toEqual([2]);
    expect(sameParty(entries, entries[2])).toEqual([]);
  });

  const screen = read('app/sort-entries.tsx');
  it('asks before doing all of them, and offers just this one', () => {
    expect(screen).toContain("{ text: 'Just this one', onPress: () => void sortEach([entry], change, label) },");
    expect(screen).toContain('onPress: () => void sortEach([entry, ...others], change, label) },');
  });
  it('gathers money in with no source by itself, every year, in a Personal budget only', () => {
    // "Want to fix old entries too - ship all to sort them out" (7 Oct 2026): no Find button,
    // the server gathers whenever the list is read, minus what was left with no source.
    const route = read('../api-server/src/routes/entries-to-sort.ts');
    expect(route).toContain('if (req.group?.isPrivate) await gatherMoneyInWithoutSource(groupId).catch(() => 0);');
    const gather = read('../api-server/src/lib/entries-to-sort.ts');
    expect(gather).toContain('SELECT 1 FROM "entries_left_unsourced" l WHERE l."transaction_id" = t."id")');
    expect(route).toContain('INSERT INTO "entries_left_unsourced" ("transaction_id", "group_id")');
    expect(screen).not.toContain('sort-entries-gather-money-in');
  });
  it('can add a source right from an entry', () => {
    expect(screen).toContain('testID={`sort-entry-${entry.id}-add-source`}');
  });
});

describe('Sort them out can be undone', () => {
  // "There is no undo button in Sort them out" (4 Oct 2026).
  const screen = read('app/sort-entries.tsx');
  it('keeps the last change - one entry or All N - and puts each back as it was', () => {
    expect(screen).toContain('testID="sort-entries-undo"');
    expect(screen).toContain("...(one.direction === 'out' ? { expenseCategory: NOT_SURE_CATEGORY } : { incomeSourceId: null })");
    expect(screen).toContain('undo: async () => { for (const one of changed) await putBack(one); },');
  });
  it('undoes "Leave it with no source" by putting it back on the list', () => {
    const leave = screen.slice(screen.indexOf('const leave = async'));
    expect(leave).toContain("await customFetch('/api/entries-to-sort', {");
    expect(leave).toContain('body: JSON.stringify({ transactionIds: [entry.id] }),');
  });
});
