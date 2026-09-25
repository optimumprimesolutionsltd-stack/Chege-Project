import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { DRAFT_MAX_AGE_MS, parseDraft } from '@/lib/draft';
import { hasUnsavedWork, markUnsavedWork } from '@/lib/unsavedWork';
import { categoryPath } from '@/lib/mpesaImport';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// "When an update for the OTA comes, it does not remove everything."
describe('a saved draft', () => {
  const now = 1_000_000_000_000;
  const stored = (savedAt: number, value: unknown) => JSON.stringify({ savedAt, value });

  it('comes back when it is recent', () => {
    expect(parseDraft<{ text: string }>(stored(now - 60_000, { text: 'hello' }), now)).toEqual({ text: 'hello' });
  });

  it('is left behind once it is older than a day of work', () => {
    expect(parseDraft(stored(now - DRAFT_MAX_AGE_MS - 1, { text: 'old' }), now)).toBeNull();
    expect(parseDraft(stored(now - DRAFT_MAX_AGE_MS + 1000, { text: 'edge' }), now)).toEqual({ text: 'edge' });
  });

  it('is ignored when missing or damaged, never breaking the screen', () => {
    expect(parseDraft(null, now)).toBeNull();
    expect(parseDraft('', now)).toBeNull();
    expect(parseDraft('not json', now)).toBeNull();
    expect(parseDraft('{"savedAt":"x","value":1}', now)).toBeNull();
    expect(parseDraft('{"savedAt":1}', now)).toBeNull();
    expect(parseDraft('null', now)).toBeNull();
  });
});

describe('knowing there is unfinished work', () => {
  beforeEach(() => {
    markUnsavedWork('a', false);
    markUnsavedWork('b', false);
  });

  it('is true while any screen has some, and false once all are saved or gone', () => {
    expect(hasUnsavedWork()).toBe(false);
    markUnsavedWork('a', true);
    markUnsavedWork('b', true);
    expect(hasUnsavedWork()).toBe(true);
    markUnsavedWork('a', false);
    expect(hasUnsavedWork()).toBe(true);
    markUnsavedWork('b', false);
    expect(hasUnsavedWork()).toBe(false);
  });
});

describe('the draft is used where work piles up', () => {
  it('removes the draft once saved, and waits to look at it before writing anything', () => {
    const draft = read('lib/draft.ts');
    expect(draft).toContain('if (!ready) return;');
    expect(draft).toContain('AsyncStorage.removeItem(PREFIX + key)');
    expect(draft).toContain('DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000');
  });

  it('the paste screen keeps its text, what was chosen by hand and the account, and says it did', () => {
    const screen = read('app/mpesa-import.tsx');
    expect(screen).toContain("key: 'mpesa-import'");
    expect(screen).toContain('value: { text, choices, hasRead: lines !== null, accountId: selectedAccountId }');
    expect(screen).toContain('active: !outcome && text.trim() !== \'\'');
    expect(screen).toContain('pendingChoicesRef.current = saved.choices;');
    expect(screen).toContain('Picked up where you left off');
    expect(screen).toContain('testID="mpesa-restored-reset"');
  });

  it('the day of banking keeps the lines not yet saved, the date and the account', () => {
    const day = read('app/bank-day.tsx');
    expect(day).toContain("key: 'bank-day'");
    expect(day).toContain('rows: rows.filter((row) => !row.saved)');
    expect(day).toContain('if (saved.rows.length > 0) setRows(saved.rows);');
    expect(day).toContain('testID="bank-day-restored-reset"');
  });

  it('the update prompt says unfinished work is kept', () => {
    const prompt = read('components/UpdatePrompt.tsx');
    expect(prompt).toContain('hasUnsavedWork()');
    expect(prompt).toContain('Your unfinished work is kept.');
  });
});

// "Still can't see categories": the paste was going into a budget with none.
describe('which budget the messages are saved into', () => {
  const screen = read('app/mpesa-import.tsx');

  it('is shown at the top, with a way to change it that keeps the paste', () => {
    expect(screen).toContain('testID="mpesa-budget-name"');
    expect(screen).toContain('These will be saved in');
    expect(screen).toContain('testID="mpesa-budget-change"');
    expect(screen).toContain('workspaces.length > 1');
    expect(screen).toContain('Your pasted messages stay here.');
  });

  it('switches the way Settings does, then reads the same messages again for the new budget', () => {
    expect(screen).toContain('await selectWorkspace.mutateAsync({ data: { groupId } });');
    expect(screen).toContain('await AsyncStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, String(groupId));');
    expect(screen).toContain('await clearQueryClientCache();');
    expect(screen).toContain('queryClient.clear();');
    expect(screen).toContain('if (textRef.current.trim()) void readRef.current(textRef.current);');
  });

  it('the web page names the budget too', () => {
    const web = read('../family-budget/src/pages/mpesa-import.tsx');
    expect(web).toContain('data-testid="mpesa-budget-name"');
    expect(web).toContain('These will be saved in');
  });
});

// "Can't see parent/category, only subcategory."
describe('a category shows the group it belongs to', () => {
  const rows = [
    { id: 1, name: 'Utilities', parentId: null },
    { id: 2, name: 'Electricity', parentId: 1 },
    { id: 3, name: 'Fun', parentId: null },
  ];

  it('reads Group › Category for a subcategory, and just the name for a top-level one', () => {
    expect(categoryPath('Electricity', rows)).toBe('Utilities › Electricity');
    expect(categoryPath('Fun', rows)).toBe('Fun');
    expect(categoryPath('Unknown', rows)).toBe('Unknown');
  });

  it('is used on the chosen category, and the picker explains the capitals', () => {
    const screen = read('app/mpesa-import.tsx');
    expect(screen).toContain('categoryPath(choice.category, categories)');
    expect(screen).toContain('The names in capitals are groups.');
    const web = read('../family-budget/src/pages/mpesa-import.tsx');
    expect(web).toContain('Filed under {categoryPath(choice.category, categories)}');
  });
});
