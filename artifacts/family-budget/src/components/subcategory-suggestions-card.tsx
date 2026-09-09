import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getGetBudgetCategoriesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FolderTree } from "lucide-react";

type Suggestions = {
  applicable: boolean;
  matched: Array<{ categoryId: number; categoryName: string; parentName: string }>;
  unparented: Array<{ categoryId: number; categoryName: string }>;
  parentOptions: Array<{ id: number; name: string }>;
};

const KEEP = "keep";

/**
 * Reviewed tidy-up for household budgets: categories the pack knows as
 * children ("Wi-Fi", "Rent") sitting at the top level are offered a move under
 * their standard parent; anything else at the top level gets a picker. Nothing
 * moves until Apply. Shows nothing when there is nothing to suggest.
 */
export function SubcategorySuggestionsCard({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [applying, setApplying] = useState(false);

  const { data, isLoading, refetch } = useQuery<Suggestions>({
    queryKey: ["subcategory-suggestions"],
    queryFn: async () => {
      const response = await fetch("/api/budget-categories/subcategory-suggestions", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load sub-category suggestions.");
      return response.json() as Promise<Suggestions>;
    },
    retry: false,
  });

  // Matched moves are ticked by default; pickers start on "keep".
  useEffect(() => {
    if (!data) return;
    setChecked(Object.fromEntries(data.matched.map((row) => [row.categoryId, true])));
    setPicked(Object.fromEntries(data.unparented.map((row) => [row.categoryId, KEEP])));
  }, [data]);

  const moves = useMemo(() => {
    if (!data) return [] as Array<{ categoryId: number; parentName?: string; parentId?: number }>;
    const fromMatched = data.matched
      .filter((row) => checked[row.categoryId])
      .map((row) => ({ categoryId: row.categoryId, parentName: row.parentName }));
    const fromPicked = data.unparented
      .filter((row) => picked[row.categoryId] && picked[row.categoryId] !== KEEP)
      .map((row) => ({ categoryId: row.categoryId, parentId: Number(picked[row.categoryId]) }));
    return [...fromMatched, ...fromPicked];
  }, [data, checked, picked]);

  if (!isLoading && (!data?.applicable || (data.matched.length === 0 && data.unparented.length === 0))) {
    return null;
  }

  const apply = async () => {
    if (moves.length === 0) return;
    setApplying(true);
    try {
      const response = await fetch("/api/budget-categories/subcategory-suggestions/apply", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moves }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not apply the changes.");
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() }),
      ]);
      toast({
        title: "Sub-categories tidied",
        description: `${moves.length} ${moves.length === 1 ? "category" : "categories"} moved. History and budgets are unchanged.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not apply",
        description: error instanceof Error ? error.message : "Nothing has been changed.",
      });
    } finally {
      setApplying(false);
    }
  };

  return (
    <Card className="border-none shadow-md">
      <CardHeader className="p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <FolderTree className="h-5 w-5 text-primary" />
          <CardTitle>Tidy up sub-categories</CardTitle>
        </div>
        <CardDescription>
          Categories that belong inside another one, so the tier report reads as a short list rather than forty rows.
          Moving a category keeps its history and budget.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 px-4 pb-4 sm:px-6 sm:pb-6">
        {isLoading ? (
          <div className="flex min-h-16 items-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : (
          <>
            {data && data.matched.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">Move under their usual parent</p>
                <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
                  {data.matched.map((row) => (
                    <li key={row.categoryId} className="flex items-center gap-3 p-3 text-sm">
                      <input
                        type="checkbox"
                        checked={checked[row.categoryId] ?? false}
                        onChange={(event) =>
                          setChecked((previous) => ({ ...previous, [row.categoryId]: event.target.checked }))
                        }
                        disabled={!canManage || applying}
                        className="h-4 w-4 shrink-0 accent-primary"
                        data-testid={`subcat-match-${row.categoryId}`}
                        aria-label={`Move ${row.categoryName} under ${row.parentName}`}
                      />
                      <span className="text-foreground">
                        <span className="font-medium">{row.categoryName}</span>
                        <span className="text-muted-foreground"> under </span>
                        <span className="font-medium">{row.parentName}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {data && data.unparented.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">Other top-level categories</p>
                <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
                  {data.unparented.map((row) => (
                    <li key={row.categoryId} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-medium text-foreground">{row.categoryName}</span>
                      <select
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm sm:w-56"
                        value={picked[row.categoryId] ?? KEEP}
                        onChange={(event) =>
                          setPicked((previous) => ({ ...previous, [row.categoryId]: event.target.value }))
                        }
                        disabled={!canManage || applying}
                        data-testid={`subcat-pick-${row.categoryId}`}
                        aria-label={`Parent for ${row.categoryName}`}
                      >
                        <option value={KEEP}>Keep at top level</option>
                        {data.parentOptions
                          .filter((option) => option.id !== row.categoryId)
                          .map((option) => (
                            <option key={option.id} value={String(option.id)}>Move under {option.name}</option>
                          ))}
                      </select>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {canManage ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void apply()}
                disabled={applying || moves.length === 0}
                data-testid="button-apply-subcategory-suggestions"
              >
                {applying ? "Applying…" : moves.length === 0 ? "Nothing selected" : `Apply ${moves.length} ${moves.length === 1 ? "move" : "moves"}`}
              </Button>
            ) : (
              <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                An owner or admin can apply these.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
