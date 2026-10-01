import { useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { autoLinkReversals, getGetDashboardBusinessQueryKey, useGetDashboardBusiness } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { MONTH_NAMES } from "@/lib/month-range";

const kes = (value: number) => {
  const rounded = Math.round(value);
  return `${rounded < 0 ? "−" : ""}${Math.abs(rounded).toLocaleString("en-KE")}`;
};
/** A margin as a share of sales, or nothing when there were no sales to share. */
const margin = (part: number, sales: number) => (sales > 0 ? `${Math.round((part / sales) * 100)}%` : null);
const shortDay = (iso: string) => {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
};

type Entry = { date: string; description: string; amount: number };
type Line = { category: string; amount: number; shareOfSales?: number | null; entries?: Entry[]; more?: number };
type Figures = { sales: number; costOfGoodsSold: number; grossProfit: number; expenses: number; netProfit: number };
type Statement = Figures & {
  incomeSourceId: number;
  name: string;
  costOfGoodsSoldLines: Line[];
  expenseLines: Line[];
  salesEntries?: Entry[];
  moreSalesEntries?: number;
  previous?: Figures & { from: string; to: string };
};

const DETAILS_KEY = "jamvi:business-details-open";

/**
 * A profit and loss statement for each side hustle, month by month - the
 * phone's Business (app/business.tsx), which the web did not have. Sales less
 * cost of goods sold is gross profit; less expenses is net profit. Details -
 * each line's entries, its share of sales, and the month before - are asked
 * for only when shown, and remembered in this browser.
 */
export default function Business() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [detailed, setDetailed] = useState<Set<number>>(() => {
    try {
      const raw = window.localStorage.getItem(DETAILS_KEY);
      return new Set(raw ? (JSON.parse(raw) as number[]).filter(Number.isFinite) : []);
    } catch {
      return new Set();
    }
  });

  // A reversed stock payment counts as cost until its money back is matched to
  // it: matched quietly on opening, as on the phone.
  const queryClient = useQueryClient();
  useEffect(() => {
    autoLinkReversals()
      .then((result) => { if (result.linked > 0) void queryClient.invalidateQueries(); })
      .catch(() => {});
  }, [queryClient]);

  const params = { month, year, ...(detailed.size > 0 ? { detail: true } : {}) };
  const { data, isLoading, isError, refetch } = useGetDashboardBusiness(params, {
    query: { queryKey: getGetDashboardBusinessQueryKey(params) },
  });
  const businesses = (data?.businesses ?? []) as unknown as Statement[];
  const totals = data?.totals as Figures | undefined;

  const remember = (next: Set<number>) => {
    setDetailed(next);
    try { window.localStorage.setItem(DETAILS_KEY, JSON.stringify([...next])); } catch { /* a convenience only */ }
  };
  const toggleDetails = (id: number) => {
    const next = new Set(detailed);
    if (next.has(id)) next.delete(id); else next.add(id);
    remember(next);
  };
  const toggle = (key: string) => setOpened((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
  const step = (delta: number) => {
    const index = year * 12 + (month - 1) + delta;
    setYear(Math.floor(index / 12));
    setMonth((index % 12) + 1);
  };

  const figure = (label: string, value: number, strong = false, note?: string | null) => (
    <div className={`flex items-center justify-between gap-2 py-1 ${strong ? "font-semibold" : ""}`}>
      <span className="text-sm text-foreground">{label}{note ? <span className="ml-2 text-xs font-normal text-muted-foreground">{note}</span> : null}</span>
      <span className={`text-sm ${value < 0 ? "text-destructive" : "text-foreground"}`}>{kes(value)}</span>
    </div>
  );
  const entryRows = (entries: Entry[], more = 0) => (
    <ul className="ml-4 border-l border-border pl-3">
      {entries.map((entry, index) => (
        <li key={`${entry.date}-${index}`} className="flex justify-between gap-2 py-0.5 text-xs text-muted-foreground">
          <span className="truncate">{shortDay(entry.date)} · {entry.description}</span>
          <span>{kes(entry.amount)}</span>
        </li>
      ))}
      {more > 0 ? <li className="py-0.5 text-xs text-muted-foreground">and {more} more</li> : null}
    </ul>
  );
  const costRows = (key: string, label: string, total: number, lines: Line[], withDetails: boolean) => {
    const isOpen = opened.has(key);
    return (
      <div>
        <button type="button" onClick={() => lines.length > 0 && toggle(key)} disabled={lines.length === 0} aria-expanded={lines.length > 0 ? isOpen : undefined}
          className="flex w-full items-center justify-between gap-2 py-1 text-left" data-testid={`business-${key}`}>
          <span className="text-sm text-foreground">− {label}{lines.length > 0 ? ` (${lines.length})` : ""}</span>
          <span className="flex items-center gap-1 text-sm text-foreground">
            {kes(total)}
            {lines.length > 0 ? (isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : null}
          </span>
        </button>
        {isOpen ? lines.map((line) => {
          const lineKey = `${key}/${line.category}`;
          const canOpen = withDetails && (line.entries?.length ?? 0) > 0;
          return (
            <div key={lineKey} className="ml-4">
              <button type="button" onClick={() => canOpen && toggle(lineKey)} disabled={!canOpen} className="flex w-full justify-between gap-2 py-0.5 text-left text-xs text-muted-foreground">
                <span>{line.category}{withDetails && line.shareOfSales != null ? ` · ${Math.round(line.shareOfSales * 100)}% of sales` : ""}</span>
                <span>{kes(line.amount)}</span>
              </button>
              {canOpen && opened.has(lineKey) && line.entries ? entryRows(line.entries, line.more ?? 0) : null}
            </div>
          );
        }) : null}
      </div>
    );
  };

  return (
    <div className="space-y-5 pb-12" data-testid="business-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Business</h1>
        <p className="text-sm text-muted-foreground">Sales, cost of goods sold, expenses and profit for each business.</p>
      </div>
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => step(-1)} aria-label="Previous month" className="rounded-md p-1.5 hover:bg-muted" data-testid="business-prev"><ChevronLeft className="h-5 w-5" /></button>
        <span className="text-sm font-bold text-foreground">{MONTH_NAMES[month - 1]} {year}</span>
        <button type="button" onClick={() => step(1)} disabled={isCurrentMonth} aria-label="Next month" className="rounded-md p-1.5 hover:bg-muted disabled:opacity-30" data-testid="business-next"><ChevronRight className="h-5 w-5" /></button>
      </div>

      {isError ? (
        <button type="button" onClick={() => void refetch()} className="w-full rounded-xl border p-4 text-sm text-muted-foreground">Couldn’t load this. Click to retry.</button>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : businesses.length === 0 ? (
        <p className="rounded-xl border p-4 text-center text-sm text-muted-foreground">
          No business yet. Link a category to an income stream as its cost (Reports, Cost categories) and its sales and costs show here.
        </p>
      ) : (
        <>
          {businesses.length > 1 && totals ? (
            <Card>
              <CardContent className="p-4" data-testid="business-totals">
                <p className="mb-1 text-xs font-semibold text-muted-foreground">ALL BUSINESSES</p>
                {figure("Sales", totals.sales)}
                {figure("Gross profit", totals.grossProfit, false, margin(totals.grossProfit, totals.sales))}
                {figure("Net profit", totals.netProfit, true, margin(totals.netProfit, totals.sales))}
              </CardContent>
            </Card>
          ) : null}
          {businesses.map((business) => {
            const withDetails = detailed.has(business.incomeSourceId) && business.previous !== undefined;
            const salesKey = `${business.incomeSourceId}-sales`;
            const previous = business.previous;
            return (
              <Card key={business.incomeSourceId} data-testid={`business-${business.incomeSourceId}`}>
                <CardContent className="space-y-1 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-base font-bold text-foreground">{business.name}</p>
                    <p className={`text-sm font-semibold ${business.netProfit < 0 ? "text-destructive" : "text-emerald-600"}`}>
                      {business.netProfit < 0 ? "Loss" : "Profit"} {kes(Math.abs(business.netProfit))}
                    </p>
                  </div>
                  {withDetails && (business.salesEntries?.length ?? 0) > 0 ? (
                    <>
                      <button type="button" onClick={() => toggle(salesKey)} className="flex w-full justify-between py-1 text-left text-sm">
                        <span>Sales</span><span>{kes(business.sales)}</span>
                      </button>
                      {opened.has(salesKey) ? entryRows(business.salesEntries ?? [], business.moreSalesEntries ?? 0) : null}
                    </>
                  ) : figure("Sales", business.sales)}
                  {costRows(`${business.incomeSourceId}-cogs`, "Cost of goods sold", business.costOfGoodsSold, business.costOfGoodsSoldLines, withDetails)}
                  {figure("= Gross profit", business.grossProfit, true, margin(business.grossProfit, business.sales))}
                  {costRows(`${business.incomeSourceId}-expenses`, "Expenses", business.expenses, business.expenseLines, withDetails)}
                  {figure("= Net profit", business.netProfit, true, margin(business.netProfit, business.sales))}
                  {withDetails && previous ? (
                    <div className="mt-2 rounded-lg bg-muted/40 p-2" data-testid={`business-compare-${business.incomeSourceId}`}>
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">
                        Against {new Date(`${previous.from}T00:00:00`).toLocaleDateString("en-KE", { month: "long" })}
                      </p>
                      {(["sales", "costOfGoodsSold", "grossProfit", "expenses", "netProfit"] as const).map((field) => {
                        const change = business[field] - previous[field];
                        const label = { sales: "Sales", costOfGoodsSold: "Cost of goods sold", grossProfit: "Gross profit", expenses: "Expenses", netProfit: "Net profit" }[field];
                        return (
                          <div key={field} className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{label}</span>
                            <span className="text-foreground">{change === 0 ? "same" : `${change > 0 ? "▲" : "▼"} ${kes(Math.abs(change))}`}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  <button type="button" onClick={() => toggleDetails(business.incomeSourceId)} className="pt-1 text-xs font-semibold text-primary" data-testid={`business-details-${business.incomeSourceId}`}>
                    {detailed.has(business.incomeSourceId) ? "Hide details" : "Show details"}
                  </button>
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
