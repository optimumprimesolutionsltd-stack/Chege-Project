import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// "Is there a report ... having all incomes and expenses in one page to compare
// which months did what" - built, the whole year by default (9 Oct 2026).
const phone = readFileSync('app/year-report.tsx', 'utf8');
const reports = readFileSync('app/(tabs)/reports.tsx', 'utf8');
const layout = readFileSync('app/_layout.tsx', 'utf8');
const web = readFileSync('../family-budget/src/pages/year-report.tsx', 'utf8');
const webApp = readFileSync('../family-budget/src/App.tsx', 'utf8');

describe('Year at a glance', () => {
  it('is reached from Reports on the phone, and from the menu on the web', () => {
    expect(reports).toContain("router.push('/year-report')");
    expect(layout).toContain('<Stack.Screen name="year-report" options={{ headerShown: false }} />');
    expect(webApp).toContain('<Route path="/year-report" component={YearReportPage} />');
  });

  it('opens on this year, the whole year in one request (9 Oct 2026)', () => {
    for (const screen of [phone, web]) {
      expect(screen).toContain('useState(today.year)');
      expect(screen).toContain('/api/dashboard/year?year=${year}');
      expect(screen).not.toContain('useQueries');
    }
  });

  it('a month on the phone opens that month\'s entries', () => {
    expect(phone).toContain("monthLedgerHref(line.side === 'in' ? '/income-ledger' : '/expense-ledger', month.year, month.month)");
  });

  it('the month row stays frozen at the top while the rows scroll (9 Oct 2026)', () => {
    expect(phone).toContain('stickyHeaderIndices={[0]}');
    expect(phone).toContain('monthRow.current?.scrollTo({ x: event.nativeEvent.contentOffset.x, animated: false })');
    expect(web).toContain('<thead className="sticky top-0 z-20 bg-card">');
  });
});

describe('the year request gives the same figures as Reports', () => {
  const dashboard = readFileSync('../api-server/src/routes/dashboard.ts', 'utf8');
  it('each month comes from the very functions the monthly reports use', () => {
    expect(dashboard).toContain('router.get("/dashboard/year"');
    expect(dashboard).toContain('const breakdown = await categoryBreakdownFor(groupId, year, month);');
    expect(dashboard).toContain('res.json(GetDashboardIncomeStreamsResponse.parse(await incomeStreamsFor(groupId, year, month)));');
    expect(dashboard).toContain('await Promise.all([categoryBreakdownFor(groupId, year, month), incomeStreamsFor(groupId, year, month)])');
  });
  it('two months at a time, to spare the database', () => {
    expect(dashboard).toContain('for (let i = 0; i < months.length; i += 2) {');
  });
});
