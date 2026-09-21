import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const day = readFileSync('app/bank-day.tsx', 'utf8');
const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
const help = readFileSync('lib/helpTopics.ts', 'utf8');

// The posting sheet asks one question at a time, which is right for one thing
// and wrong for eleven. Somebody working off a statement knows the day
// already; "Save and add another" still made them walk it a line at a time.
describe('a day can be written down before it is saved', () => {
  it('is reachable from the Banking tab', () => {
    expect(bank).toContain('testID="bank-day-action"');
    expect(bank).toContain("router.push('/bank-day')");
  });

  it('holds one date and one account for the whole of it', () => {
    // That is what makes it a day rather than a pile of postings.
    expect(day).toContain('testID="bank-day-date"');
    expect(day).toContain('const activeAccountId = selectedAccountId ?? accounts[0]?.id ?? null;');
  });

  it('takes lines of any kind, because a real day is a mix', () => {
    expect(day).toContain("| 'spend'");
    expect(day).toContain("| 'pay-party'");
    expect(day).toContain("| 'money-in'");
    expect(day).toContain("| 'repaid'");
    expect(day).toContain("| 'borrowed';");
  });

  it('lets a line be added and taken away', () => {
    expect(day).toContain('testID="bank-day-add-row"');
    expect(day).toContain('const removeRow = (key: string) => {');
  });

  it('never leaves nothing to type into', () => {
    expect(day).toContain('current.length === 1 ? [blankRow()]');
  });
});

describe('the balance moves as the day is written', () => {
  it('shows what the day leaves before any of it is saved', () => {
    expect(day).toContain('testID="bank-day-projected"');
    expect(day).toContain('const projected = openingBalance + unsavedRows.reduce((total, row) => total + rowEffect(row), 0);');
  });

  it('counts each line the way that line runs', () => {
    expect(day).toContain("return (isOutgoing(row.kind) ? -amount : amount) - fee;");
  });

  it('takes the fee off whichever way the line runs', () => {
    // A fee on money in is still a fee.
    expect(day).toContain('- fee;');
  });

  it('stops counting a line once it is saved', () => {
    // Otherwise the projection double-counts what the balance already holds.
    expect(day).toContain('const unsavedRows = rows.filter((row) => !row.saved);');
  });

  it('does arithmetic in every amount, as the sheet does', () => {
    expect(day).toContain("import { readAmount, toMoney } from '@/lib/bankAmount';");
  });
});

describe('saving leaves no batch behind', () => {
  it('writes ordinary postings, one per line', () => {
    // Nothing records that these arrived together. Afterwards the day looks
    // exactly as it would had it been typed one at a time.
    expect(day).toContain('await createDisbursement({');
    expect(day).toContain('await createDeposit({');
    expect(day).not.toContain('batchId');
  });

  it('carries the kind of each line onto its posting', () => {
    expect(day).toContain("...(row.kind === 'repaid' && party ? { settlesContributorId: party.id } : {}),");
    expect(day).toContain("...(row.kind === 'borrowed' ? { isBorrowing: true } : {}),");
  });

  it('posts a line fee separately, after the line it belongs to', () => {
    const save = day.slice(day.indexOf('const saveRow ='));
    expect(save.indexOf('if (fee > 0) {')).toBeGreaterThan(save.indexOf('await createDeposit({'));
    expect(day).toContain('description: `Bank charge — ${narration}`,');
  });

  it('refuses a line that is not ready before writing anything', () => {
    // Half a day saved because line seven had no category is worse than none.
    expect(day).toContain('const problem = rowProblem(row);');
    expect(day).toContain("Alert.alert('One line is not ready', problem);");
  });
});

describe('when one line fails part way', () => {
  it('keeps what was written written', () => {
    // The postings that succeeded are real and the bank agrees with them.
    expect(day).toContain('saved.push(row);');
    expect(day).toContain('...candidate, saved: true');
  });

  it('says how far it got', () => {
    expect(day).toContain("saved.length === 0 ? 'Nothing was saved' : `${saved.length} saved, then this one stopped`");
    expect(day).toContain('What saved is saved. The rest is still here.');
  });

  it('leaves the rest on screen rather than starting over', () => {
    expect(day).toContain('testID="bank-day-saved-count"');
    expect(day).toContain('The rest is still here.');
  });
});

describe('the balances are offered once, at the end', () => {
  it('asks for the whole day together rather than after every line', () => {
    // Eleven prompts in a row is not a question, it is a wall.
    expect(day).toContain('const offerBalanceChanges = async (saved: DayRow[]) => {');
    expect(day).toContain("changes.length === 1 ? 'Update this balance too?' : `Update ${changes.length} balances too?`");
  });

  it('still asks rather than applying', () => {
    expect(day).toContain("{ text: 'Not now', style: 'cancel' },");
    expect(day).toContain('The postings are already saved either way.');
  });

  it('moves each balance the way that line moved it', () => {
    expect(day).toContain('owedByUs: remaining');
    expect(day).toContain('owedToUs: remaining');
    expect(day).toContain('owedByUs: owed + amount');
    expect(day).toContain('debtBalance: owed + amount');
    expect(day).toContain('debtBalance: remaining');
  });

  it('never drives a balance below zero', () => {
    expect((day.match(/Math\.max\(0, owed - amount\)/g) ?? []).length).toBe(3);
  });

  it('is in the guide', () => {
    expect(help).toContain('Record a whole day from a statement');
  });
});
