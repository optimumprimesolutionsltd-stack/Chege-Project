import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const day = readFileSync('app/bank-day.tsx', 'utf8').replace(/\r\n/g, '\n');

// The Bank tab's deposit form offers "Where did this money come from?" but a
// day of banking's Money in rows offered nothing, so income posted that way
// never carried an income stream. Reported as: "for money in, it should give
// options of source of income".
describe('a day of banking asks where money in came from', () => {
  it('lists the income streams on ordinary money-in rows only', () => {
    expect(day).toContain("row.kind === 'money-in' && incomeSources.length > 0");
    expect(day).toContain('Where did this money come from? (optional)');
    expect(day).toContain('bank-day-income-source-${index}-${source.id}');
  });
  it('posts the chosen stream with the deposit', () => {
    expect(day).toContain("...(row.kind === 'money-in' && row.incomeSourceId ? { incomeSourceId: row.incomeSourceId } : {}),");
  });
  it('offers the person\'s own streams in a Personal budget and the group\'s in a shared one', () => {
    expect(day).toContain('`/api/income-sources?userId=${user.id}` : \'/api/income-sources\'');
  });
});
