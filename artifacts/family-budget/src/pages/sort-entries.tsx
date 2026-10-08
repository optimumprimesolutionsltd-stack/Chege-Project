import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import {
  getGetJointAccountQueryKey,
  useGetBudgetCategories,
  useGetIncomeSources,
  useUpdateJointAccountTransaction,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { isNotSure, isToCheck, type EntryToSort } from "@/lib/entries-to-sort";
import { inMonth, monthsOf } from "@/lib/mpesa-import";
import { plainSaveError } from "@/lib/save-retry";
import { formatDate } from "@/lib/utils";

const kes = (value: number) => value.toLocaleString("en-KE", { maximumFractionDigits: 0 });

/**
 * Entries saved as "Not sure", one at a time - the phone's Sort them out
 * (app/sort-entries.tsx). Each leaves the list once it is given a category or
 * a source (api-server routes/entries-to-sort).
 */
export default function SortEntries() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<number | null>(null);
  const { data, isLoading, isError, refetch } = useQuery<{ entries: EntryToSort[] }>({
    queryKey: ["entries-to-sort"],
    queryFn: async () => {
      const response = await fetch("/api/entries-to-sort", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load these.");
      return response.json();
    },
    retry: false,
  });
  const { data: categoryList = [] } = useGetBudgetCategories();
  const { data: incomeSources = [] } = useGetIncomeSources();
  const updateTx = useUpdateJointAccountTransaction();

  // Only categories that carry spending: not a heading, and not "Not sure yet" itself.
  const categories = useMemo(() => {
    const parents = new Set(categoryList.map((row) => row.parentId).filter((id): id is number => id != null));
    return categoryList.filter((row) => !parents.has(row.id) && !isNotSure(row.name)).map((row) => row.name).sort((a, b) => a.localeCompare(b));
  }, [categoryList]);
  const entries = data?.entries ?? [];
  // A month at a time, and a page at a time: a whole year is over a thousand.
  const [month, setMonth] = useState<string | null>(null);
  const [shownCount, setShownCount] = useState(50);
  const months = useMemo(() => monthsOf(entries), [entries]);
  const inView = useMemo(() => entries.filter((entry) => inMonth(entry, month)), [entries, month]);

  const done = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["entries-to-sort"] }),
    queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey() }),
  ]);
  const run = async (entry: EntryToSort, action: () => Promise<unknown>) => {
    setBusy(entry.id);
    try {
      await action();
      await done();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not change it", description: plainSaveError(error) });
    } finally {
      setBusy(null);
    }
  };
  const sort = (entry: EntryToSort, change: { expenseCategory: string } | { incomeSourceId: number }) =>
    run(entry, () => updateTx.mutateAsync({ id: entry.id, data: { amount: entry.amount, date: entry.date, ...change } as never }));
  // Money in saved earlier with a source Jamvi may have guessed, listed to check
  // (as on the phone): Keep leaves it as it is; another source takes it off too.
  const sourceName = (id: number | null | undefined) => incomeSources.find((source) => source.id === id)?.name ?? "its source";
  const keep = (entry: EntryToSort) =>
    run(entry, async () => {
      const response = await fetch("/api/entries-to-sort/checked", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionIds: [entry.id] }),
      });
      if (!response.ok) throw new Error("Could not change it.");
    });
  const leave = (entry: EntryToSort) =>
    run(entry, async () => {
      const response = await fetch(`/api/entries-to-sort/${entry.id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error("Could not change it.");
    });

  return (
    <div className="space-y-5 pb-12" data-testid="sort-entries-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Sort them out</h1>
        <p className="text-sm text-muted-foreground">Entries you saved as Not sure, and money in to check.</p>
      </div>
      {months.length > 1 ? (
        <div className="flex flex-wrap gap-2" data-testid="sort-entries-months">
          {[{ key: null as string | null, label: "All months", count: entries.length }, ...months].map((option) => (
            <button key={option.key ?? "all"} type="button" onClick={() => { setMonth(option.key); setShownCount(50); }} aria-pressed={month === option.key}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${month === option.key ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted"}`}>
              {option.label} ({option.count})
            </button>
          ))}
        </div>
      ) : null}
      {isLoading ? (
        <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : isError ? (
        <button type="button" onClick={() => void refetch()} className="w-full rounded-xl border p-4 text-sm text-muted-foreground">Couldn’t load these. Click to try again.</button>
      ) : inView.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-1 p-6 text-center" data-testid="sort-entries-empty">
            <CheckCircle2 className="h-8 w-8 text-success" />
            <p className="font-semibold text-foreground">All sorted</p>
            <p className="text-sm text-muted-foreground">Nothing saved as Not sure is waiting.</p>
          </CardContent>
        </Card>
      ) : (
        inView.slice(0, shownCount).map((entry) => (
          <Card key={entry.id} className={busy === entry.id ? "opacity-60" : ""} data-testid={`sort-entry-${entry.id}`}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">{entry.description}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(entry.date)} · {entry.direction === "out" ? "Money out" : "Money in"}</p>
                </div>
                <p className={`font-bold ${entry.direction === "out" ? "text-destructive" : "text-success"}`}>{entry.direction === "out" ? "−" : "+"}{kes(entry.amount)}</p>
              </div>
              {isToCheck(entry) ? <p className="text-xs text-muted-foreground">Saved under {sourceName(entry.incomeSourceId)}. Is that right?</p> : null}
              <div className="flex flex-wrap gap-2">
                {isToCheck(entry) ? (
                  <Button variant="outline" disabled={busy !== null} onClick={() => void keep(entry)} data-testid={`sort-entry-${entry.id}-keep`}>Keep {sourceName(entry.incomeSourceId)}</Button>
                ) : null}
                <select
                  defaultValue=""
                  disabled={busy !== null}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (!value) return;
                    void (entry.direction === "out" ? sort(entry, { expenseCategory: value }) : sort(entry, { incomeSourceId: Number(value) }));
                  }}
                  className="h-10 min-w-[14rem] flex-1 rounded-md border border-input bg-background px-3 text-sm"
                  aria-label={entry.direction === "out" ? "What was it for?" : "Where did it come from?"}
                  data-testid={`sort-entry-${entry.id}-choose`}
                >
                  <option value="">{entry.direction === "out" ? "What was it for?" : isToCheck(entry) ? "Change it to..." : "Where did it come from?"}</option>
                  {entry.direction === "out"
                    ? categories.map((name) => <option key={name} value={name}>{name}</option>)
                    : incomeSources.filter((source) => source.id !== entry.incomeSourceId).map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
                </select>
                {entry.direction === "in" && !isToCheck(entry) ? (
                  <Button variant="ghost" disabled={busy !== null} onClick={() => void leave(entry)} data-testid={`sort-entry-${entry.id}-leave`}>Leave it with no source</Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))
      )}
      {inView.length > shownCount ? (
        <Button variant="outline" className="w-full" onClick={() => setShownCount((count) => count + 50)} data-testid="sort-entries-more">
          Show 50 more ({inView.length - shownCount} left)
        </Button>
      ) : null}
    </div>
  );
}
