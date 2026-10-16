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
    expect(bank).toContain('Salary from {business.name}');
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
