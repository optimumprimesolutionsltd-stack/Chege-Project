import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Download, Loader2 } from "lucide-react";
import {
  getDashboardMonthlyReportPdf,
  getGetDashboardExpenseLedgerQueryKey,
  useGetBudgetCategories,
  useGetDashboardExpenseLedger,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MonthStepper } from "@/components/month-stepper";
import { useToast } from "@/hooks/use-toast";
import { groupByCategory, groupByItem } from "@/lib/ledger-groups";
import { isoDay } from "@/lib/month-range";

const formatKes = (value: number) => `KES ${value.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
const shortDay = (iso: string) => {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
};
const longDay = (iso: string) => {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
};
const monthStart = () => `${isoDay(new Date()).slice(0, 8)}01`;

/**
 * Every expense in one list - the phone's All expenses (app/expense-ledger.tsx),
 * which the web did not have: a statement for the whole budget, by date, by
 * category or by item, a month at a time, with a PDF of what is shown.
 */
export default function ExpenseLedger() {
  const { toast } = useToast();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"date" | "category" | "item">("date");
  const [scope, setScope] = useState<"household" | "business">("household");
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [rangeFrom, rangeTo] = from <= to ? [from, to] : [to, from];

  const query = useMemo(() => ({ from: rangeFrom, to: rangeTo, ...(search.trim() ? { q: search.trim() } : {}) }), [rangeFrom, rangeTo, search]);
  const { data, isLoading, isError, refetch } = useGetDashboardExpenseLedger(query, {
    query: { queryKey: getGetDashboardExpenseLedgerQueryKey(query) },
  });
  const allEntries = data?.entries ?? [];

  // A category linked to an income stream is a side hustle's cost, not the
  // household's: it gets a Business costs tab of its own, as on the phone.
  const { data: budgetCategories = [] } = useGetBudgetCategories();
  const costNames = useMemo(
    () => new Set(budgetCategories.filter((row) => row.reducesIncomeSourceId != null).map((row) => row.name.trim().toLocaleLowerCase("en-KE"))),
    [budgetCategories],
  );
  const hasBusiness = costNames.size > 0;
  const isBusiness = (entry: (typeof allEntries)[number]) =>
    entry.categories.length > 0 && entry.categories.every((name) => costNames.has(name.trim().toLocaleLowerCase("en-KE")));
  const entries = useMemo(
    () => (hasBusiness ? allEntries.filter((entry) => (scope === "business") === isBusiness(entry)) : allEntries),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allEntries, scope, hasBusiness, costNames],
  );
  const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
  const groups = useMemo(() => (view === "category" ? groupByCategory(entries) : view === "item" ? groupByItem(entries) : []), [entries, view]);
  const days = useMemo(() => {
    const grouped: { date: string; rows: typeof entries }[] = [];
    for (const entry of entries) {
      const last = grouped[grouped.length - 1];
      if (last && last.date === entry.date) last.rows.push(entry);
      else grouped.push({ date: entry.date, rows: [entry] });
    }
    return grouped;
  }, [entries]);

  const toggle = (key: string) => setOpened((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const downloadPdf = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await getDashboardMonthlyReportPdf(
        {
          from: rangeFrom,
          to: rangeTo,
          includeSummary: false,
          includeBudget: false,
          includeIncome: false,
          includeExpenses: true,
          ...(hasBusiness ? { expensesScope: scope } : {}),
          ...(view !== "date" ? { expensesGroupBy: view, expensesDetail: "detailed" as const } : {}),
        },
        { responseType: "blob", cache: "no-store" },
      );
      const href = URL.createObjectURL(blob as Blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `jamvi-${scope === "business" ? "business-costs" : "expenses"}-${rangeFrom}-to-${rangeTo}.pdf`;
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (error) {
      toast({ variant: "destructive", title: "Could not make the PDF", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setExporting(false);
    }
  };

  const row = (entry: (typeof entries)[number]) => (
    <li key={entry.id} className="flex items-center gap-3 py-2.5" data-testid={`expense-ledger-entry-${entry.id}`}>
      <span className="w-14 shrink-0 text-xs text-muted-foreground">{shortDay(entry.date)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{entry.description}</span>
        <span className="block truncate text-xs text-muted-foreground">{entry.categories.join(" + ")} · {entry.payerName}</span>
      </span>
      <span className="text-sm font-semibold text-foreground">{entry.amount.toLocaleString("en-KE", { maximumFractionDigits: 0 })}</span>
    </li>
  );

  return (
    <div className="space-y-5 pb-12" data-testid="expense-ledger-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">All expenses</h1>
          <p className="text-sm text-muted-foreground">Everything that went out, newest first.</p>
        </div>
        <Button variant="outline" onClick={() => void downloadPdf()} disabled={exporting} data-testid="expense-ledger-pdf">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} PDF
        </Button>
      </div>

      {hasBusiness ? (
        <div className="flex gap-2" role="tablist">
          {(["household", "business"] as const).map((value) => (
            <button key={value} type="button" role="tab" aria-selected={scope === value} onClick={() => setScope(value)}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${scope === value ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted"}`}
              data-testid={`expense-ledger-scope-${value}`}>
              {value === "household" ? "Household" : "Business costs"}
            </button>
          ))}
        </div>
      ) : null}

      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find an expense" className="h-10" data-testid="expense-ledger-search" />
      <MonthStepper from={from} to={to} onChange={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo); }} testId="expense-ledger-month" />
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-sm"><span className="font-semibold">From</span><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-10" /></label>
        <label className="space-y-1 text-sm"><span className="font-semibold">To</span><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-10" /></label>
      </div>

      <Card>
        <CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-foreground" data-testid="expense-ledger-total">{isLoading ? "Loading…" : formatKes(total)}</p>
          <p className="text-xs text-muted-foreground">{entries.length} {entries.length === 1 ? "entry" : "entries"} · {longDay(rangeFrom)} – {longDay(rangeTo)}</p>
        </CardContent>
      </Card>

      <div className="flex gap-2" role="tablist">
        {(["date", "category", "item"] as const).map((value) => (
          <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => setView(value)}
            className={`flex-1 rounded-full border px-3 py-1.5 text-sm font-semibold ${view === value ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted"}`}
            data-testid={`expense-ledger-view-${value}`}>
            By {value}
          </button>
        ))}
      </div>

      {isError ? (
        <button type="button" onClick={() => void refetch()} className="w-full rounded-xl border p-4 text-sm text-muted-foreground">Couldn’t load this. Click to retry.</button>
      ) : entries.length === 0 && !isLoading ? (
        <p className="rounded-xl border p-4 text-center text-sm text-muted-foreground">No expenses recorded between these dates.</p>
      ) : view === "date" ? (
        <div className="space-y-3">
          {days.map((group) => (
            <Card key={group.date}>
              <CardContent className="p-4">
                <p className="text-xs font-semibold text-muted-foreground">{longDay(group.date)}</p>
                <ul className="divide-y divide-border">{group.rows.map(row)}</ul>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const isOpen = opened.has(group.key);
            return (
              <Card key={group.key}>
                <CardContent className="p-0">
                  <button type="button" onClick={() => toggle(group.key)} aria-expanded={isOpen} className="flex w-full items-center gap-3 p-4 text-left" data-testid={`expense-ledger-group-${group.key}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">{group.label}</span>
                      <span className="block text-xs text-muted-foreground">{group.count} {group.count === 1 ? "entry" : "entries"}</span>
                    </span>
                    <span className="text-sm font-semibold text-foreground">{group.total.toLocaleString("en-KE", { maximumFractionDigits: 0 })}</span>
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {isOpen ? <ul className="divide-y divide-border border-t px-4">{group.rows.map(row)}</ul> : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
