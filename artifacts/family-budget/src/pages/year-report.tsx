import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cellText, yearGrid, yearMonths, type BreakdownRow, type GridRow, type IncomeMonth } from "@/lib/year-grid";

/**
 * The year at a glance - the phone's app/year-report.tsx: every income stream
 * and spending category, a column a month, the whole year by default
 * (lib/year-grid). Each month comes from the reports Reports shows for it.
 */
type YearAnswer = { year: number; months: Array<{ year: number; month: number; breakdown: BreakdownRow[]; income: IncomeMonth }> };

export default function YearReportPage() {
  const now = new Date();
  const today = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const [year, setYear] = useState(today.year);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const months = useMemo(() => yearMonths(year, today), [year, today.year, today.month]); // eslint-disable-line react-hooks/exhaustive-deps

  // The whole year in one request (api-server /dashboard/year), as on the phone.
  const yearQuery = useQuery<YearAnswer>({
    queryKey: ["/api/dashboard/year", year],
    queryFn: async () => {
      const response = await fetch(`/api/dashboard/year?year=${year}`, { credentials: "include" });
      if (!response.ok) throw new Error("The year did not load.");
      return response.json();
    },
    staleTime: 60_000,
  });
  const loading = yearQuery.isLoading;
  const failed = yearQuery.isError;
  const grid = useMemo(() => {
    const byMonth = new Map((yearQuery.data?.months ?? []).map((one) => [one.month, one]));
    return yearGrid(
      months,
      months.map(({ month }) => byMonth.get(month)?.breakdown),
      months.map(({ month }) => byMonth.get(month)?.income),
    );
  }, [months, yearQuery.data]);
  const toggle = (key: string) => setOpened((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const total = (amounts: number[]) => amounts.reduce((sum, amount) => sum + amount, 0);

  const cells = (amounts: number[], peak: number, bold: boolean, net = false) => (
    <>
      {grid.months.map((month, index) => {
        const amount = amounts[index] ?? 0;
        return (
          <td
            key={month.month}
            className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${index === peak ? "bg-primary/10 font-bold" : ""} ${bold ? "font-bold" : ""} ${month.soFar ? "italic" : ""} ${amount === 0 ? "text-muted-foreground" : net ? (amount < 0 ? "text-destructive" : "text-emerald-600") : "text-foreground"}`}
            title={index === peak ? "The most this year" : undefined}
          >
            {cellText(amount)}
          </td>
        );
      })}
      <td className={`whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums ${net ? (total(amounts) < 0 ? "text-destructive" : "text-emerald-600") : "text-foreground"}`}>{cellText(total(amounts))}</td>
    </>
  );
  const nameCell = "sticky left-0 z-10 min-w-[11rem] max-w-[14rem] bg-card px-3 py-2 text-left";
  const rows = (prefix: string, list: readonly GridRow[]) =>
    list.map((row) => {
      const key = `${prefix}:${row.name}`;
      const heading = row.children.length > 0;
      const open = opened.has(key);
      return (
        <Fragment key={key}>
          <tr className="border-b border-border" data-testid={`year-report-row-${key}`}>
            <th scope="row" className={`${nameCell} ${heading ? "font-semibold" : "font-normal"}`}>
              {heading ? (
                <button type="button" onClick={() => toggle(key)} aria-expanded={open} className="flex items-center gap-1 text-left">
                  {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  {row.name}
                </button>
              ) : row.name}
            </th>
            {cells(row.amounts, heading ? -1 : row.peak, heading)}
          </tr>
          {heading && open
            ? row.children.map((child) => (
              <tr key={`${key}:${child.name}`} className="border-b border-border">
                <th scope="row" className={`${nameCell} pl-8 font-normal text-muted-foreground`}>{child.name}</th>
                {cells(child.amounts, child.peak, false)}
              </tr>
            ))
            : null}
        </Fragment>
      );
    });
  const section = (label: string) => (
    <tr className="bg-muted">
      <th scope="rowgroup" colSpan={grid.months.length + 2} className="sticky left-0 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</th>
    </tr>
  );

  return (
    <div className="space-y-5 pb-12" data-testid="year-report-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Year at a glance</h1>
        <p className="text-sm text-muted-foreground">Every income and expense, month by month. The busiest month in each row is marked.</p>
      </div>
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setYear((y) => y - 1)} aria-label="Previous year" data-testid="year-report-prev"><ChevronLeft className="h-5 w-5" /></Button>
        <p className="font-bold text-foreground" data-testid="year-report-year">{year}</p>
        <Button variant="ghost" size="icon" onClick={() => setYear((y) => Math.min(today.year, y + 1))} disabled={year >= today.year} aria-label="Next year" data-testid="year-report-next"><ChevronRight className="h-5 w-5" /></Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <Card>
          <CardContent className="p-0">
            {failed ? <p className="px-3 py-2 text-sm text-destructive">The year did not load. Refresh the page to try again.</p> : null}
            {/* Scrolls inside its own box so the month row can stay frozen at the top. */}
            <div className="max-h-[75vh] overflow-auto">
              <table className="w-full border-collapse text-sm" data-testid="year-report-grid">
                <thead className="sticky top-0 z-20 bg-card">
                  <tr className="border-b border-border">
                    <th className={`${nameCell} font-semibold`}>{year}</th>
                    {grid.months.map((month) => (
                      <th key={month.month} className="whitespace-nowrap px-3 py-2 text-right font-semibold">
                        {month.label}{month.soFar ? <span className="block text-[10px] font-normal text-muted-foreground">so far</span> : null}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-semibold">Year</th>
                  </tr>
                </thead>
                <tbody>
                  {section("Money in")}
                  {rows("in", grid.income)}
                  <tr className="border-b border-border bg-card"><th scope="row" className={`${nameCell} font-bold`}>Total in</th>{cells(grid.moneyIn, -1, true)}</tr>
                  {section("Money out")}
                  {rows("out", grid.spending)}
                  <tr className="border-b border-border"><th scope="row" className={`${nameCell} font-bold`}>Total out</th>{cells(grid.moneyOut, -1, true)}</tr>
                  <tr className="border-b border-border"><th scope="row" className={`${nameCell} font-bold`}>Left over</th>{cells(grid.leftOver, -1, true, true)}</tr>
                  {grid.businessCosts.length > 0 ? (
                    <>
                      {section("Your businesses' costs (not in money out)")}
                      {rows("biz", grid.businessCosts)}
                    </>
                  ) : null}
                </tbody>
              </table>
            </div>
            {grid.income.length === 0 && grid.spending.length === 0 ? <p className="px-3 py-4 text-sm text-muted-foreground">Nothing recorded in {year} yet.</p> : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
