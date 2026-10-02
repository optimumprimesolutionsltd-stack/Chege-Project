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
import { isNotSure, type EntryToSort } from "@/lib/entries-to-sort";
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
  const leave = (entry: EntryToSort) =>
    run(entry, async () => {
      const response = await fetch(`/api/entries-to-sort/${entry.id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error("Could not change it.");
    });

  return (
    <div className="space-y-5 pb-12" data-testid="sort-entries-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Sort them out</h1>
        <p className="text-sm text-muted-foreground">Entries you saved as Not sure.</p>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : isError ? (
        <button type="button" onClick={() => void refetch()} className="w-full rounded-xl border p-4 text-sm text-muted-foreground">Couldn’t load these. Click to try again.</button>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-1 p-6 text-center" data-testid="sort-entries-empty">
            <CheckCircle2 className="h-8 w-8 text-success" />
            <p className="font-semibold text-foreground">All sorted</p>
            <p className="text-sm text-muted-foreground">Nothing saved as Not sure is waiting.</p>
          </CardContent>
        </Card>
      ) : (
        entries.map((entry) => (
          <Card key={entry.id} className={busy === entry.id ? "opacity-60" : ""} data-testid={`sort-entry-${entry.id}`}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">{entry.description}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(entry.date)} · {entry.direction === "out" ? "Money out" : "Money in"}</p>
                </div>
                <p className={`font-bold ${entry.direction === "out" ? "text-destructive" : "text-success"}`}>{entry.direction === "out" ? "−" : "+"}{kes(entry.amount)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
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
                  <option value="">{entry.direction === "out" ? "What was it for?" : "Where did it come from?"}</option>
                  {entry.direction === "out"
                    ? categories.map((name) => <option key={name} value={name}>{name}</option>)
                    : incomeSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
                </select>
                {entry.direction === "in" ? (
                  <Button variant="ghost" disabled={busy !== null} onClick={() => void leave(entry)} data-testid={`sort-entry-${entry.id}-leave`}>Leave it with no source</Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
