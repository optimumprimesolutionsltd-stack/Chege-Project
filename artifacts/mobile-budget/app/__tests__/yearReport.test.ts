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

  it('opens on this year, a month a column, from the reports each month already has', () => {
    for (const screen of [phone, web]) {
      expect(screen).toContain('useState(today.year)');
      expect(screen).toContain('getGetDashboardCategoryBreakdownQueryKey({ month: m, year: y })');
      expect(screen).toContain('getGetDashboardIncomeStreamsQueryKey({ month: m, year: y })');
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
