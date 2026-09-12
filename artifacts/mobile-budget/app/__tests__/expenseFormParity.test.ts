import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The two expense forms have to agree with each other.
 *
 * They drifted quietly: the same mode was called "Detailed" on the phone and
 * "Advanced" in the browser, and the block that tells you what Normal mode
 * decided on your behalf listed three assumptions on the web and one on
 * mobile. Nothing was broken in either place, which is exactly why it went
 * unnoticed - each form is coherent read on its own, and only someone using
 * both would find them saying different things about the same feature.
 *
 * This reads the web source from the mobile suite deliberately. A test that
 * only checked mobile's wording would pass happily while the web moved on.
 */
const mobile = readFileSync('app/add-expense.tsx', 'utf8');
const web = readFileSync('../family-budget/src/pages/expenses.tsx', 'utf8');

describe('the mode is called the same thing on both', () => {
  it('uses Quick and Detailed, the plainer pair, on both', () => {
    expect(mobile).toContain('>Quick</Text>');
    expect(mobile).toContain('>Detailed</Text>');
    // The web had two more names for the same pair: "Normal/Advanced" on the
    // expenses page and "Simple/Advanced" in the dashboard quick log. Both
    // are checked, because unifying only one of them leaves the drift.
    expect(web).toContain('Quick mode');
    expect(web).toContain('Use Detailed');
    const dashboard = readFileSync('../family-budget/src/pages/dashboard.tsx', 'utf8');
    expect(dashboard).toContain('["simple", "Quick"]');
    expect(dashboard).toContain('["advanced", "Detailed"]');
    expect(dashboard).not.toContain('"Simple"');
  });

  it('matches the word the web uses for the same control', () => {
    expect(web).toContain('Use Detailed');
    expect(mobile).toContain('Use Detailed');
    expect(web).not.toContain('Use Advanced');
    expect(mobile).not.toContain('Use Advanced');
  });

  it('keeps each surface’s own description rather than flattening them', () => {
    // Renaming the mode should not cost the web the detail it already had:
    // its hint names splits, bank funding, notes and recurrence.
    const dashboard = readFileSync('../family-budget/src/pages/dashboard.tsx', 'utf8');
    expect(dashboard).toContain('Use Detailed for splits, bank funding, notes, or recurring expenses.');
    expect(mobile).toContain('Quick: one category, paid by you, today.');
  });
});

describe('Normal mode states what it decided for you', () => {
  it('opens the same way on both', () => {
    expect(web).toContain('Jamvi will record this as:');
    expect(mobile).toContain('Jamvi will record this as:');
  });

  it.each([
    ['who paid, and that no bank or repeat is involved', 'paid by you, not from a bank account, and not recurring'],
    ['that the whole amount goes to one category', 'the full whole-KES amount in'],
    ['which income source funded it', 'funded in full from'],
    ['what to do when there is no income source yet', 'funded from your saved income source once you select Detailed'],
  ])('states %s', (_label, phrase) => {
    // Mobile used to state only the date, category and source, so the same
    // mode promised less on the smaller screen.
    expect(web).toContain(phrase);
    expect(mobile).toContain(phrase);
  });

  it('blocks a missing income source in the same words', () => {
    const blocker = 'Add an income source before recording this expense.';
    expect(web).toContain(blocker);
    expect(mobile).toContain(blocker);
  });
});

/**
 * The contributions forms, which had drifted the other way.
 *
 * Here it was the web that was thinner: its modes were called "Simple" and
 * "Advanced", which describe how hard they are rather than what they do,
 * while the phone called them "Same amount" and "Per person". But the web
 * carried a line the phone did not - that the list arrives fully ticked - and
 * that is the one thing a treasurer has to act on.
 *
 * Parity here meant taking the better half of each rather than picking a
 * winner, so both are pinned.
 */
describe('the contributions forms', () => {
  const webContrib = readFileSync('../family-budget/src/components/record-contributions.tsx', 'utf8');
  const mobileContrib = readFileSync('app/record-contributions.tsx', 'utf8');

  it('names the modes for what they do, on both', () => {
    for (const source of [webContrib, mobileContrib]) {
      expect(source).toContain('Same amount');
      expect(source).toContain('Per person');
    }
    // "Simple"/"Advanced" said nothing about what either mode did.
    expect(webContrib).not.toContain('"Simple" : "Advanced"');
  });

  it('keeps the phone’s explanation of what switching does', () => {
    const clause = 'Switching to Per person fills every row with it.';
    expect(mobileContrib).toContain(clause);
    expect(webContrib).toContain(clause);
  });

  it('keeps the web’s line about everyone starting ticked', () => {
    const line = 'Everyone is ticked to start. Untick anyone who has not paid.';
    expect(webContrib).toContain(line);
    expect(mobileContrib).toContain(line);
  });

  it('explains the per-person mode the same way on both', () => {
    const clause = 'clear a row for someone who paid nothing';
    expect(webContrib).toContain(clause);
    expect(mobileContrib).toContain(clause);
  });
});

/**
 * What keeps the expense form quick to type in.
 *
 * The form holds thirty-odd pieces of state, so every keystroke re-renders the
 * whole of it. That is tolerable only while the expensive parts skip the work:
 * the lists that do not depend on the text, and the derived figures that scan
 * other lists to produce their answer.
 *
 * All of it rests on useColors returning a stable object; see
 * hooks/__tests__/useColors.test.ts. Without that every memo here is decorative.
 */
describe('the expense form stays cheap to re-render', () => {
  const form = readFileSync('app/add-expense.tsx', 'utf8');

  it.each([
    ['the category chips', 'const CategoryChip = React.memo('],
    ['the payer pills', 'const PayerPill = React.memo('],
  ])('memoises %s', (_label, marker) => {
    expect(form).toContain(marker);
  });

  it('hands the rows stable callbacks rather than a closure each', () => {
    // A closure built inside the map is a new function every render and would
    // defeat the memo without leaving any sign that it had.
    expect(form).toContain('const togglePayer = useCallback(');
    expect(form).toContain('onToggle={togglePayer}');
    expect(form).toContain('onSelect={chooseCategory}');
  });

  it('works out the disabled state once, not once per pill', () => {
    // A group of forty computed the same answer forty times per keystroke.
    expect(form).toContain('const payersDisabled = getExpenseFundingControlState({');
    expect(form).toContain('disabled={soleDirectPayer || payersDisabled}');
  });

  it('memoises the derived figures that scan other lists', () => {
    expect(form).toContain('const categoryBalancePreviews = useMemo(');
    expect(form).toContain('const hasBudgetedCategorySelection = useMemo(');
  });
});
