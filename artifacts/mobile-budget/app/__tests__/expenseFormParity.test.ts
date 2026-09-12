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
  it('uses Normal and Advanced, not Quick and Detailed', () => {
    expect(mobile).toContain('>Normal</Text>');
    expect(mobile).toContain('>Advanced</Text>');
    expect(mobile).not.toContain('>Quick</Text>');
    expect(mobile).not.toContain('>Detailed</Text>');
  });

  it('matches the word the web uses for the same control', () => {
    expect(web).toContain('Use Advanced');
    expect(mobile).toContain('Use Advanced');
  });

  it('carries the web’s description of Normal mode', () => {
    const line = 'Normal mode keeps everyday expenses quick to record.';
    expect(web).toContain(line);
    expect(mobile).toContain(line);
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
    ['what to do when there is no income source yet', 'funded from your saved income source once you select Advanced'],
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
