import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');

// "In money in, why cant i see the option of salary? ... and also enable a
// split. e.g salary and something else" (16 Oct 2026).
describe('Money in: salary from one of your businesses', () => {
  it('is offered for each business that pays you one, filed under its salary stream', () => {
    expect(bank).toContain("one.paysSalary === true && typeof one.salaryStreamId === 'number'");
    expect(bank).toContain('testID={`bank-deposit-salary-from-${business.id}`}');
    expect(bank).toContain('setIncomeSourceId(business.salaryStreamId);');
    // One row of chips under MY SALARY FROM, not a line per business (16 Oct 2026).
    expect(bank).toContain('MY SALARY FROM');
    expect(bank).toContain('testID="bank-deposit-salary-row"');
    // One question on money in: no Who is this for? beside it (16 Oct 2026).
    expect(bank).toContain("No Who is this for? on money in");
  });

  it('says so once chosen', () => {
    expect(bank).toContain('? `Salary from ${salaryChosen.name}`');
  });

  it('knows each business\'s salary stream from the server, refreshed after a salary answer', () => {
    const route = readFileSync('../api-server/src/routes/businesses.ts', 'utf8');
    expect(route).toContain("salaryStreamId: business.paysSalary === true ? (await findOrMakeSalaryStream(groupId, business.id).catch(() => null))?.id ?? null : null,");
    expect(readFileSync('hooks/useBusinesses.ts', 'utf8')).toContain("void queryClient.invalidateQueries({ queryKey: ['businesses'] });");
  });
});

describe('Money in: one payment split across income streams', () => {
  it('offers a split once a stream is chosen, for new money in from one person', () => {
    expect(bank).toContain('testID="bank-deposit-stream-split"');
    expect(bank).toContain("{streamSplits.length === 0 ? 'Split it - part of this was something else' : 'Add another part'}");
  });

  it('saves the person\'s portions, one per stream, the rest on the first', () => {
    expect(bank).toContain('{ userId: singleId, amount: restCents / 100, incomeSourceId },');
    expect(bank).toContain('...parts.map((row) => ({ userId: singleId, amount: parseBankAmount(row.amount) ?? 0, incomeSourceId: row.incomeSourceId as number })),');
    expect(bank).toContain('if (restCents <= 0) {');
  });

  it('starts empty each time the form opens', () => {
    expect(bank.match(/setStreamSplits\(\[\]\);/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});

// "The income streams are not effective if you dont press which kind of money is
// this ... why are they not linked? can one be removed?" (17 Oct 2026).
describe('Money in, Personal: one question for what the money is', () => {
  it('lists income streams under What kind of money is this?, and drops the second question', () => {
    expect(bank).toContain('testID="bank-deposit-income-row"');
    expect(bank).toContain('INCOME FROM');
    expect(bank).toContain('{isDeposit && isSharedWorkspace && !notIncome && forBusinessId === null');
  });
});

// "The date freeze logic should apply in banking too, both months and dates" (17 Oct 2026).
describe('Money: the date of the entries in view stays at the top', () => {
  it('follows the first entry in view once the header has scrolled away', () => {
    expect(bank).toContain('onViewableItemsChanged={onViewableRows}');
    expect(bank).toContain('testID="bank-date-pill"');
  });
});
