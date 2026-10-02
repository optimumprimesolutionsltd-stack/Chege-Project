import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import {
  getDashboardMonthlyReportPdf,
  getGetDashboardCategoryBreakdownQueryKey,
  useGetDashboardCategoryBreakdown,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { budgetPlan, type PlanRow } from "@/lib/budget-plan-rows";
import { MONTH_NAMES } from "@/lib/month-range";

const kes = (value: number) => `KES ${Math.round(value).toLocaleString("en-KE")}`;

/**
 * The budget as planned, and nothing else - the phone's Budget plan
 * (app/budget-plan.tsx), which the web did not have: each heading, what sits
 * under it and how much is budgeted, with the total, a month at a time, and a
 * PDF to share or print.
 */
export default function BudgetPlanPage() {
  const { toast } = useToast();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [exporting, setExporting] = useState(false);
  const params = { month, year };
  const { data, isLoading, isError, refetch } = useGetDashboardCategoryBreakdown(params, {
    query: { queryKey: getGetDashboardCategoryBreakdownQueryKey(params) },
  });
  const plan = useMemo(() => budgetPlan((data ?? []) as unknown as PlanRow[]), [data]);
  const step = (delta: number) => {
    const index = year * 12 + (month - 1) + delta;
    setYear(Math.floor(index / 12));
    setMonth((index % 12) + 1);
  };

  const downloadPdf = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await getDashboardMonthlyReportPdf(
        { month, year, includeSummary: false, includeBudget: false, includeIncome: false, includeBudgetPlan: true },
        { responseType: "blob", cache: "no-store" },
      );
      const href = URL.createObjectURL(blob as Blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `jamvi-budget-plan-${year}-${String(month).padStart(2, "0")}.pdf`;
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (error) {
      toast({ variant: "destructive", title: "Could not make the PDF", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5 pb-12" data-testid="budget-plan-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Budget plan</h1>
          <p className="text-sm text-muted-foreground">What you have budgeted for</p>
        </div>
        <Button variant="outline" onClick={() => void downloadPdf()} disabled={exporting || isLoading} data-testid="budget-plan-pdf">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} PDF
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => step(-1)} aria-label="Previous month" data-testid="budget-plan-prev"><ChevronLeft className="h-5 w-5" /></Button>
        <p className="font-bold text-foreground">{MONTH_NAMES[month - 1]} {year}</p>
        <Button variant="ghost" size="icon" onClick={() => step(1)} aria-label="Next month" data-testid="budget-plan-next"><ChevronRight className="h-5 w-5" /></Button>
      </div>

      {isError ? (
        <button type="button" onClick={() => void refetch()} className="w-full rounded-xl border p-4 text-sm text-muted-foreground" data-testid="budget-plan-retry">Couldn’t load this. Click to retry.</button>
      ) : isLoading ? (
        <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : plan.headings.length === 0 ? (
        <p className="rounded-xl border p-4 text-center text-sm text-muted-foreground">Nothing is budgeted for this month yet.</p>
      ) : (
        <>
          <Card>
            <CardContent className="p-4 text-center" data-testid="budget-plan-total">
              <p className="text-2xl font-bold text-foreground">{kes(plan.householdTotal)}</p>
              <p className="text-xs text-muted-foreground">
                budgeted for {MONTH_NAMES[month - 1]} across {plan.headings.filter((heading) => !heading.business).length} headings
              </p>
              {plan.businessTotal > 0 ? (
                <p className="text-xs text-muted-foreground">+ {kes(plan.businessTotal)} for income-stream costs, budgeted apart</p>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="divide-y divide-border px-4 py-0">
              {plan.headings.map((heading) => (
                <div key={heading.name} className="space-y-1.5 py-3" data-testid={`budget-plan-heading-${heading.name}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-foreground">{heading.name}{heading.business ? " · income stream" : ""}</p>
                    <p className="text-sm font-semibold text-foreground">{kes(heading.budget)}</p>
                  </div>
                  {heading.children.map((child) => (
                    <div key={child.name} className="flex items-center justify-between gap-3 pl-4">
                      <p className="truncate text-xs text-muted-foreground">{child.name}</p>
                      <p className="text-xs text-muted-foreground">{kes(child.budget)}</p>
                    </div>
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
