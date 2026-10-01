import { TrendingUp } from "lucide-react";
import { getGetDashboardIncomeStreamsTrendQueryKey, useGetDashboardIncomeStreamsTrend } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const amount = (value: number) => value.toLocaleString("en-KE", { maximumFractionDigits: 0 });
const short = (value: number) => (value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1_000 ? `${Math.round(value / 1_000)}K` : String(Math.round(value)));

/**
 * Each income stream month by month - the phone's Income Trend on Reports,
 * which the web did not have. One small bar chart per stream over the last six
 * months, its best month marked; a month with nothing in it keeps a sliver of
 * bar so the axis still reads.
 */
export function IncomeTrendCard() {
  const { data, isLoading, isError, refetch } = useGetDashboardIncomeStreamsTrend(
    { months: 6 },
    { query: { queryKey: getGetDashboardIncomeStreamsTrendQueryKey({ months: 6 }), retry: false } },
  );
  const months = data?.months ?? [];
  const streams = data?.streams ?? [];
  return (
    <Card className="overflow-hidden border-none shadow-md" data-testid="income-trend-section">
      <CardHeader className="border-b border-border/50 bg-muted/30 pb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-secondary" />
          <CardTitle className="text-xl">Income trend</CardTitle>
        </div>
        <CardDescription>Per stream, last {months.length || 6} months</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading the income trend…</p>
        ) : isError ? (
          <button type="button" onClick={() => void refetch()} className="text-sm text-muted-foreground" data-testid="income-trend-retry">
            Couldn’t load the income trend. Click to try again.
          </button>
        ) : streams.length === 0 ? (
          <p className="text-sm text-muted-foreground">No income streams recorded yet.</p>
        ) : (
          streams.map((stream) => {
            const max = Math.max(1, ...stream.amounts);
            return (
              <div key={stream.incomeSourceId ?? "unattributed"} className="rounded-xl border border-border p-3" data-testid={`income-trend-stream-${stream.incomeSourceId ?? "unattributed"}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">{stream.sourceName}</p>
                  <p className="text-xs text-muted-foreground">KES {amount(stream.total)} total</p>
                </div>
                <div className="flex h-24 items-end gap-2">
                  {months.map((month, index) => {
                    const value = stream.amounts[index] ?? 0;
                    const height = value > 0 ? Math.max(6, Math.round((value / max) * 72)) : 2;
                    const peak = value > 0 && value === max;
                    return (
                      <div key={`${month.year}-${month.month}`} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${month.label}: KES ${amount(value)}`}>
                        {peak ? <span className="text-[10px] font-semibold text-primary">{short(value)}</span> : null}
                        <div className={`w-full rounded-sm ${peak ? "bg-primary" : "bg-primary/35"}`} style={{ height }} />
                        <span className={`text-[10px] ${peak ? "font-semibold text-primary" : "text-muted-foreground"}`}>{month.label.split(" ")[0]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
