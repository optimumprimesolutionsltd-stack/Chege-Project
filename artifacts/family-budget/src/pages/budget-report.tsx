import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2 } from "lucide-react";
import {
  getGetDashboardCategoryBreakdownQueryKey,
  useGetDashboardCategoryBreakdown,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { budgetReport, overBy, type BudgetRow } from "@/lib/budget-report";
import { MONTH_NAMES } from "@/lib/month-range";

const amount = (value: number) => Math.round(value).toLocaleString("en-KE");

/**
 * What was planned against what was spent, for one month - the phone's Budget
 * report (app/budget-report.tsx), which the web did not have. Overspends first,
 * then every category, then income-stream costs and spending with no budget,
 * each apart. By month, because budgets are monthly.
 */
export default function BudgetReportPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const params = { month, year };
  const { data, isLoading, isError, refetch } = useGetDashboardCategoryBreakdown(params, {
    query: { queryKey: getGetDashboardCategoryBreakdownQueryKey(params) },
  });
  const rows = (data ?? []) as unknown as BudgetRow[];
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
  const step = (delta: number) => {
    const index = year * 12 + (month - 1) + delta;
    setYear(Math.floor(index / 12));
    setMonth((index % 12) + 1);
  };
  const { topLevel, childrenOf, unbudgeted, over, totals, businessCosts } = useMemo(() => budgetReport(rows), [rows]);
  const left = totals.left;

  const toggle = (name: string) => setOpened((current) => {
    const next = new Set(current);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  const bar = (spent: number, budget: number) => {
    const fraction = budget > 0 ? Math.min(1, spent / budget) : 0;
    const isOver = budget > 0 && spent > budget;
    return (
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${isOver ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.round(fraction * 100)}%` }} />
      </div>
    );
  };
  const status = (row: BudgetRow) => {
    if (row.budgetAmount <= 0) return <span className="text-xs text-muted-foreground">tracked</span>;
    const by = overBy(row);
    return by > 0
      ? <span className="text-xs font-semibold text-destructive">{amount(by)} over</span>
      : <span className="text-xs font-semibold text-success">{amount(row.budgetAmount - row.spentAmount)} left</span>;
  };
  const renderRow = (row: BudgetRow, nested = false) => {
    const children = childrenOf.get(row.category) ?? [];
    const isOpen = opened.has(row.category);
    return (
      <div key={`${row.parentName ?? ""}/${row.category}`} className={`space-y-1.5 py-3 ${nested ? "pl-4" : ""}`} data-testid={`budget-report-row-${row.category}`}>
        <button type="button" onClick={children.length > 0 ? () => toggle(row.category) : undefined} disabled={children.length === 0}
          aria-expanded={children.length > 0 ? isOpen : undefined} className="flex w-full items-center gap-3 text-left disabled:cursor-default">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">{row.category}</span>
            <span className="block text-xs text-muted-foreground">KES {amount(row.spentAmount)}{row.budgetAmount > 0 ? ` of ${amount(row.budgetAmount)}` : ""}</span>
          </span>
          {status(row)}
          {children.length > 0 ? (isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />) : null}
        </button>
        {row.budgetAmount > 0 ? bar(row.spentAmount, row.budgetAmount) : null}
        {isOpen ? children.map((child) => renderRow(child, true)) : null}
      </div>
    );
  };

  return (
    <div className="space-y-5 pb-12" data-testid="budget-report-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Budget report</h1>
        <p className="text-sm text-muted-foreground">What you planned against what you spent</p>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => step(-1)} aria-label="Previous month" data-testid="budget-report-prev"><ChevronLeft className="h-5 w-5" /></Button>
        <p className="font-bold text-foreground" data-testid="budget-report-month">{MONTH_NAMES[month - 1]} {year}</p>
        <Button variant="ghost" size="icon" onClick={() => step(1)} disabled={isCurrentMonth} aria-label="Next month" data-testid="budget-report-next"><ChevronRight className="h-5 w-5" /></Button>
      </div>

      {isError ? (
        <button type="button" onClick={() => void refetch()} className="w-full rounded-xl border p-4 text-sm text-muted-foreground" data-testid="budget-report-retry">Couldn’t load this. Click to retry.</button>
      ) : isLoading ? (
        <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border p-4 text-center text-sm text-muted-foreground">No budget or spending for {MONTH_NAMES[month - 1]} {year}.</p>
      ) : (
        <>
          <Card>
            <CardContent className="space-y-2 p-4" data-testid="budget-report-summary">
              <p className="text-xl font-bold text-foreground">KES {amount(totals.spent)} <span className="text-sm font-normal text-muted-foreground">of {amount(totals.budget)}</span></p>
              {totals.budget > 0 ? bar(totals.spent, totals.budget) : null}
              <p className={`text-sm font-semibold ${left < 0 ? "text-destructive" : "text-success"}`}>
                {left < 0 ? `KES ${amount(-left)} over budget` : `KES ${amount(left)} left`}
              </p>
              <p className="text-sm text-muted-foreground">
                {over.length === 0 ? "No category is over budget." : `${over.length} ${over.length === 1 ? "category is" : "categories are"} over budget.`}
                {totals.spentUnbudgeted > 0 ? ` KES ${amount(totals.spentUnbudgeted)} was spent with no budget behind it.` : ""}
              </p>
            </CardContent>
          </Card>

          {over.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-destructive">Over budget</h2>
              <Card className="border-destructive">
                <CardContent className="divide-y divide-border px-4 py-0" data-testid="budget-report-over">
                  {over.map((row) => (
                    <div key={`over/${row.parentName ?? ""}/${row.category}`} className="flex items-center gap-3 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">{row.category}</span>
                        <span className="block truncate text-xs text-muted-foreground">{row.parentName ? `${row.parentName} · ` : ""}KES {amount(row.spentAmount)} of {amount(row.budgetAmount)}</span>
                      </span>
                      <span className="text-xs font-semibold text-destructive">{amount(overBy(row))} over</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          ) : null}

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Every category</h2>
            <Card><CardContent className="divide-y divide-border px-4 py-0">{topLevel.map((row) => renderRow(row))}</CardContent></Card>
          </section>

          {businessCosts.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">Income-stream costs, not counted above</h2>
              <Card>
                <CardContent className="px-4 py-2" data-testid="budget-report-business-costs">
                  {businessCosts.map((row) => (
                    <div key={`biz/${row.category}`} className="flex items-center justify-between gap-3 py-2">
                      <span className="truncate text-sm font-semibold">{row.category}</span>
                      <span className="text-sm">KES {amount(row.spentAmount)}</span>
                    </div>
                  ))}
                  <p className="pb-2 text-xs text-muted-foreground">These come off their income stream's profit in Business, so they are not household spending.</p>
                </CardContent>
              </Card>
            </section>
          ) : null}

          {unbudgeted.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">Spent without a budget</h2>
              <Card>
                <CardContent className="px-4 py-2" data-testid="budget-report-unbudgeted">
                  {unbudgeted.map((row) => (
                    <div key={`none/${row.category}`} className="flex items-center justify-between gap-3 py-2">
                      <span className="truncate text-sm font-semibold">{row.category}</span>
                      <span className="text-sm">KES {amount(row.spentAmount)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
