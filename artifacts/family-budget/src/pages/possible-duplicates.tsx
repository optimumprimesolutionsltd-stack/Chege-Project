import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { getGetExpensesQueryKey, getGetJointAccountQueryKey, useUpdateJointAccountTransaction } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { categoryToKeep, deletePathFor, duplicatesTitle, pairKey, sameQuestion, type DuplicatePair, type DuplicateSide } from "@/lib/possible-duplicates";
import { plainSaveError } from "@/lib/save-retry";
import { formatDate, formatKes } from "@/lib/utils";

/**
 * One payment recorded twice - typed by hand and brought in from M-Pesa - one
 * pair at a time (lib/possible-duplicates). Nothing is removed until the person
 * says it is the same payment. The phone has the same screen.
 */
export default function PossibleDuplicates() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateTx = useUpdateJointAccountTransaction();
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<{ pairs: DuplicatePair[] }>({
    queryKey: ["possible-duplicates"],
    queryFn: async () => {
      const response = await fetch("/api/possible-duplicates", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load possible duplicates.");
      return response.json();
    },
    retry: false,
  });
  const pairs = data?.pairs ?? [];

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["possible-duplicates"] }),
      queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetExpensesQueryKey() }),
    ]);

  const same = async (pair: DuplicatePair) => {
    if (!window.confirm(`Same payment?\n\n${sameQuestion(pair)}`)) return;
    setBusy(pairKey(pair));
    try {
      const category = categoryToKeep(pair);
      if (category) {
        await updateTx.mutateAsync({ id: pair.imported.id, data: { amount: pair.imported.amount, date: pair.imported.date, expenseCategory: category } as never });
      }
      const response = await fetch(deletePathFor(pair.typed), { method: "DELETE", credentials: "include" });
      if (!response.ok && response.status !== 404) throw new Error("Could not remove the typed entry.");
      await refresh();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not change it", description: plainSaveError(error) });
    } finally {
      setBusy(null);
    }
  };

  const different = async (pair: DuplicatePair) => {
    setBusy(pairKey(pair));
    try {
      const response = await fetch("/api/possible-duplicates/dismiss", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typedKind: pair.typed.kind, typedId: pair.typed.id, importedId: pair.imported.id }),
      });
      if (!response.ok) throw new Error("Could not save that.");
      await queryClient.invalidateQueries({ queryKey: ["possible-duplicates"] });
    } catch (error) {
      toast({ variant: "destructive", title: "Could not save that", description: plainSaveError(error) });
    } finally {
      setBusy(null);
    }
  };

  const side = (label: string, entry: DuplicateSide, tone: string) => (
    <div className="flex-1 rounded-lg border p-3">
      <p className={`text-[11px] font-bold tracking-wide ${tone}`}>{label}</p>
      <p className="font-semibold text-foreground">{entry.description || "No description"}</p>
      <p className="text-xs text-muted-foreground">{formatKes(entry.amount)} · {formatDate(entry.date)}</p>
      <p className="text-xs text-muted-foreground">{entry.category ?? "No category"}{entry.receipt ? ` · ${entry.receipt}` : ""}</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">Possible duplicates</h1>
        <p className="text-sm text-muted-foreground">
          Each pair looks like one payment recorded twice: once typed by hand, once from M-Pesa. Same amount, within a day. Say which it is - nothing is removed until you do.
        </p>
      </div>
      {isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      ) : isError ? (
        <button type="button" onClick={() => void refetch()} className="text-sm text-destructive underline">Could not load them. Try again.</button>
      ) : pairs.length === 0 ? (
        <div className="flex items-center gap-2 text-foreground"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Nothing recorded twice.</div>
      ) : (
        <>
          <p className="font-semibold" data-testid="possible-duplicates-count">{duplicatesTitle(pairs.length)}</p>
          {pairs.map((pair) => (
            <Card key={pairKey(pair)} data-testid={`possible-duplicate-${pairKey(pair)}`}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                  {side("TYPED BY HAND", pair.typed, "text-amber-600")}
                  {side("FROM M-PESA", pair.imported, "text-primary")}
                </div>
                {busy === pairKey(pair) ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  <div className="flex gap-2">
                    <Button onClick={() => void same(pair)} data-testid={`possible-duplicate-same-${pairKey(pair)}`}>Same payment</Button>
                    <Button variant="outline" onClick={() => void different(pair)} data-testid={`possible-duplicate-different-${pairKey(pair)}`}>Different payments</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
