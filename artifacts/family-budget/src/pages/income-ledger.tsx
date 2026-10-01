import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Download, Loader2 } from "lucide-react";
import {
  getDashboardMonthlyReportPdf,
  getGetDashboardIncomeLedgerQueryKey,
  useGetDashboardIncomeLedger,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MonthStepper } from "@/components/month-stepper";
import { useToast } from "@/hooks/use-toast";
import { isoDay } from "@/lib/month-range";

const amount = (value: number) => value.toLocaleString("en-KE", { maximumFractionDigits: 0 });
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
 * Everything that came in - the phone's All income (app/income-ledger.tsx),
 * which the web did not have: by date, or by income stream with what each
 * received, what it cost to earn and what it actually earned. Money that came
 * in without being income (borrowed, paid back, from savings, reversed) is
 * named but not counted.
 */
export default function IncomeLedger() {
  const { toast } = useToast();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"date" | "stream">("date");
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [rangeFrom, rangeTo] = from <= to ? [from, to] : [to, from];

  const query = useMemo(() => ({ from: rangeFrom, to: rangeTo, ...(search.trim() ? { q: search.trim() } : {}) }), [rangeFrom, rangeTo, search]);
  const { data, isLoading, isError, refetch } = useGetDashboardIncomeLedger(query, {
    query: { queryKey: getGetDashboardIncomeLedgerQueryKey(query) },
  });
  const entries = data?.entries ?? [];
  const other = data?.otherMoneyIn;
  const otherParts = [
    other?.borrowed ? `KES ${amount(other.borrowed)} borrowed` : null,
    other?.repaidToYou ? `KES ${amount(other.repaidToYou)} paid back to you` : null,
    other?.fromSavings ? `KES ${amount(other.fromSavings)} from savings` : null,
    other?.moneyBack ? `KES ${amount(other.moneyBack)} money back from reversed payments` : null,
  ].filter((part): part is string => part != null);

  const days = useMemo(() => {
    const grouped: { date: string; rows: typeof entries }[] = [];
    for (const entry of entries) {
      const last = grouped[grouped.length - 1];
      if (last && last.date === entry.date) last.rows.push(entry);
      else grouped.push({ date: entry.date, rows: [entry] });
    }
    return grouped;
  }, [entries]);

  // One card per stream, as the server worked it out; a split deposit sits
  // under each of its streams at that stream's share.
  const streamGroups = useMemo(() => (data?.streams ?? []).map((stream) => {
    const rows = entries.flatMap((entry) => {
      const share = entry.portions.filter((portion) => portion.incomeSourceId === stream.incomeSourceId).reduce((sum, portion) => sum + portion.amount, 0);
      return share > 0 || entry.portions.some((portion) => portion.incomeSourceId === stream.incomeSourceId) ? [{ entry, share }] : [];
    });
    return { ...stream, key: `s:${stream.incomeSourceId ?? "none"}`, rows };
  }), [data?.streams, entries]);

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
          includeIncome: true,
          includeExpenses: false,
          ...(view === "stream" ? { incomeGroupBy: "stream" as const, incomeDetail: "detailed" as const } : {}),
        },
        { responseType: "blob", cache: "no-store" },
      );
      const href = URL.createObjectURL(blob as Blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `jamvi-income-${rangeFrom}-to-${rangeTo}.pdf`;
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (error) {
      toast({ variant: "destructive", title: "Could not make the PDF", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setExporting(false);
    }
  };

  const row = (entry: (typeof entries)[number], share?: number) => (
    <li key={`${entry.id}-${share ?? "all"}`} className="flex items-center gap-3 py-2.5" data-testid={`income-ledger-entry-${entry.id}`}>
      <span className="w-14 shrink-0 text-xs text-muted-foreground">{shortDay(entry.date)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{entry.description}</span>
        <span className="block truncate text-xs text-muted-foreground">{[entry.streams.join(" + "), entry.receivedFrom, entry.accountName].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="text-sm font-semibold text-foreground">{amount(share ?? entry.amount)}</span>
    </li>
  );

  const total = data?.total ?? 0;
  return (
    <div className="space-y-5 pb-12" data-testid="income-ledger-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">All income</h1>
          <p className="text-sm text-muted-foreground">Everything that came in, newest first.</p>
        </div>
        <Button variant="outline" onClick={() => void downloadPdf()} disabled={exporting} data-testid="income-ledger-pdf">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} PDF
        </Button>
      </div>

      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find income" className="h-10" data-testid="income-ledger-search" />
      <MonthStepper from={from} to={to} onChange={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo); }} testId="income-ledger-month" />
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-sm"><span className="font-semibold">From</span><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-10" /></label>
        <label className="space-y-1 text-sm"><span className="font-semibold">To</span><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-10" /></label>
      </div>

      <Card>
        <CardContent className="space-y-1 p-4 text-center">
          <p className="text-2xl font-bold text-foreground" data-testid="income-ledger-total">
            {isLoading ? "Loading…" : `KES ${total < 0 ? "−" : ""}${amount(Math.abs(total))}`}
          </p>
          <p className="text-xs text-muted-foreground">{entries.length} {entries.length === 1 ? "entry" : "entries"} · {longDay(rangeFrom)} – {longDay(rangeTo)}</p>
          {!isLoading && (data?.costs ?? 0) > 0 ? (
            <p className="text-xs text-muted-foreground">Received KES {amount(data?.received ?? 0)} less KES {amount(data?.costs ?? 0)} your income streams cost to earn</p>
          ) : null}
          {otherParts.length > 0 ? (
            <p className="text-xs text-muted-foreground" data-testid="income-ledger-other">Also came in, not counted as income: {otherParts.join(", ")}.</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex gap-2" role="tablist">
        {(["date", "stream"] as const).map((value) => (
          <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => setView(value)}
            className={`flex-1 rounded-full border px-3 py-1.5 text-sm font-semibold ${view === value ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted"}`}
            data-testid={`income-ledger-view-${value}`}>
            {value === "date" ? "By date" : "By income stream"}
          </button>
        ))}
      </div>

      {isError ? (
        <button type="button" onClick={() => void refetch()} className="w-full rounded-xl border p-4 text-sm text-muted-foreground">Couldn’t load this. Click to retry.</button>
      ) : entries.length === 0 && !isLoading ? (
        <p className="rounded-xl border p-4 text-center text-sm text-muted-foreground">No income recorded between these dates.</p>
      ) : view === "date" ? (
        <div className="space-y-3">
          {days.map((group) => (
            <Card key={group.date}>
              <CardContent className="p-4">
                <p className="text-xs font-semibold text-muted-foreground">{longDay(group.date)}</p>
                <ul className="divide-y divide-border">{group.rows.map((entry) => row(entry))}</ul>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {streamGroups.map((group) => {
            const isOpen = opened.has(group.key);
            return (
              <Card key={group.key}>
                <CardContent className="p-0">
                  <button type="button" onClick={() => toggle(group.key)} aria-expanded={isOpen} className="flex w-full items-center gap-3 p-4 text-left" data-testid={`income-ledger-group-${group.key}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">{group.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {group.costs > 0 ? `Received ${amount(group.received)} − costs ${amount(group.costs)}` : `${group.rows.length} ${group.rows.length === 1 ? "entry" : "entries"}`}
                      </span>
                    </span>
                    <span className={`text-right text-sm font-semibold ${group.net < 0 ? "text-destructive" : "text-foreground"}`}>
                      {group.net < 0 ? `−${amount(Math.abs(group.net))}` : amount(group.net)}
                      {group.costs > 0 ? <span className="block text-xs font-normal text-muted-foreground">{group.net < 0 ? "loss" : "profit"}</span> : null}
                    </span>
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {isOpen ? (
                    <ul className="divide-y divide-border border-t px-4">
                      {group.rows.length === 0
                        ? <li className="py-2.5 text-xs text-muted-foreground">Nothing came in from this stream between these dates.</li>
                        : group.rows.map(({ entry, share }) => row(entry, share))}
                    </ul>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
