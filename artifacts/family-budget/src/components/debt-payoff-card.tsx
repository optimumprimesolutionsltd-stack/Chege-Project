import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatInterestRate, rankDebtsForPayoff, type DebtCategory, type PayoffStrategy } from "@/lib/debts";
import { Loader2, TrendingDown, Plus } from "lucide-react";

const QUERY_KEY = ["budget-categories-full"];

const STRATEGY_COPY: Record<PayoffStrategy, { label: string; hint: string }> = {
  snowball: { label: "Snowball", hint: "Smallest balance first — quick wins that keep a plan going." },
  avalanche: { label: "Avalanche", hint: "Highest interest rate first — costs the least overall." },
};

function toDigits(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

/**
 * A debt is a budget category with a balance and interest rate tracked on
 * it — no separate ledger. Ranks tracked debts by snowball or avalanche, and
 * lets a manager tag a category as a debt or update its balance directly.
 */
export function DebtPayoffCard({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [strategy, setStrategy] = useState<PayoffStrategy>("snowball");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBalance, setEditBalance] = useState("");
  const [editRate, setEditRate] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBalance, setNewBalance] = useState("");
  const [newRate, setNewRate] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: categories = [], isLoading } = useQuery<DebtCategory[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await fetch("/api/budget-categories", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load your budget categories.");
      return response.json() as Promise<DebtCategory[]>;
    },
  });

  const ranked = rankDebtsForPayoff(categories, strategy);

  const startEditing = (debt: DebtCategory) => {
    setEditingId(debt.id);
    setEditBalance(String(debt.debtBalance ?? 0));
    setEditRate(debt.debtInterestRateBps != null ? String(debt.debtInterestRateBps / 100) : "");
  };

  const putCategory = async (id: number, body: Record<string, unknown>) => {
    const response = await fetch(`/api/budget-categories/${id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(result.error ?? "Could not update this category.");
  };

  const saveEdit = async (id: number) => {
    setSaving(true);
    try {
      await putCategory(id, {
        debtBalance: Math.max(0, Number(toDigits(editBalance)) || 0),
        debtInterestRateBps: editRate.trim() ? Math.round(Number(editRate) * 100) : null,
      });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setEditingId(null);
    } catch (error) {
      toast({ variant: "destructive", title: "Could not update this debt", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const stopTracking = async (id: number) => {
    try {
      await putCategory(id, { debtBalance: null, debtInterestRateBps: null });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    } catch (error) {
      toast({ variant: "destructive", title: "Could not update this debt", description: error instanceof Error ? error.message : "Please try again." });
    }
  };

  const addDebt = async () => {
    const name = newName.trim();
    if (!name) {
      toast({ variant: "destructive", title: "Name required", description: "What is this debt called? e.g. Fuliza, SACCO loan." });
      return;
    }
    setSaving(true);
    try {
      const debtBalance = Math.max(0, Number(toDigits(newBalance)) || 0);
      const debtInterestRateBps = newRate.trim() ? Math.round(Number(newRate) * 100) : null;
      const existing = categories.find((category) => category.name.trim().toLocaleLowerCase("en-US") === name.toLocaleLowerCase("en-US"));
      if (existing) {
        await putCategory(existing.id, { debtBalance, debtInterestRateBps });
      } else {
        const response = await fetch("/api/budget-categories", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, budgetAmount: 0, debtBalance, debtInterestRateBps }),
        });
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Could not create this category.");
      }
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setNewName("");
      setNewBalance("");
      setNewRate("");
      setAddingNew(false);
    } catch (error) {
      toast({ variant: "destructive", title: "Could not track this debt", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-none shadow-sm bg-card">
      <CardHeader className="p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-primary" />
          <CardTitle>Debt payoff order</CardTitle>
        </div>
        <CardDescription>
          Track a balance on any category — Fuliza, a SACCO loan, a shopkeeper's debt — and see which to pay off first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 px-4 pb-4 sm:px-6 sm:pb-6">
        {isLoading ? (
          <div className="flex min-h-16 items-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : (
          <>
            {ranked.length > 0 ? (
              <>
                <div className="flex gap-2">
                  {(Object.keys(STRATEGY_COPY) as PayoffStrategy[]).map((value) => {
                    const selected = strategy === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={selected}
                        data-testid={`button-debt-strategy-${value}`}
                        onClick={() => setStrategy(value)}
                        className={`flex-1 rounded-xl border py-2 text-sm font-semibold transition-colors ${selected ? "border-primary bg-primary/10 text-primary ring-1 ring-primary" : "border-border bg-card text-foreground hover:border-primary/50"}`}
                      >
                        {STRATEGY_COPY[value].label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">{STRATEGY_COPY[strategy].hint}</p>

                <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
                  {ranked.map((debt, index) => (
                    <li key={debt.id} className="flex gap-3 p-3">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${index === 0 ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>
                        {index + 1}
                      </span>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-semibold text-foreground">{debt.name}</p>
                        <p className="text-xs text-muted-foreground">
                          KES {debt.debtBalance!.toLocaleString("en-KE")} · {formatInterestRate(debt.debtInterestRateBps)}
                        </p>
                        {editingId === debt.id ? (
                          <div className="mt-2 space-y-2 sm:max-w-xs">
                            <Input
                              data-testid={`input-debt-balance-${debt.id}`}
                              value={editBalance}
                              onChange={(event) => setEditBalance(toDigits(event.target.value))}
                              placeholder="Balance (KES)"
                              disabled={saving}
                            />
                            <Input
                              data-testid={`input-debt-rate-${debt.id}`}
                              value={editRate}
                              onChange={(event) => setEditRate(event.target.value)}
                              placeholder="Rate % per year (optional)"
                              disabled={saving}
                            />
                            <div className="flex gap-2">
                              <Button type="button" size="sm" onClick={() => void saveEdit(debt.id)} disabled={saving} data-testid={`button-save-debt-${debt.id}`}>
                                {saving ? "Saving…" : "Save"}
                              </Button>
                              <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={saving}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : canManage ? (
                          <div className="flex gap-4 pt-1">
                            <button type="button" data-testid={`button-edit-debt-${debt.id}`} onClick={() => startEditing(debt)} className="text-xs font-semibold text-primary hover:underline">
                              Update balance
                            </button>
                            <button type="button" data-testid={`button-stop-tracking-debt-${debt.id}`} onClick={() => void stopTracking(debt.id)} className="text-xs font-semibold text-destructive hover:underline">
                              Stop tracking
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing tracked yet.</p>
            )}

            {canManage ? (
              addingNew ? (
                <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-4 sm:max-w-sm">
                  <Input
                    data-testid="input-new-debt-name"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    placeholder="Debt name — e.g. Fuliza"
                    disabled={saving}
                  />
                  <Input
                    data-testid="input-new-debt-balance"
                    value={newBalance}
                    onChange={(event) => setNewBalance(toDigits(event.target.value))}
                    placeholder="Balance (KES)"
                    disabled={saving}
                  />
                  <Input
                    data-testid="input-new-debt-rate"
                    value={newRate}
                    onChange={(event) => setNewRate(event.target.value)}
                    placeholder="Rate % per year (optional)"
                    disabled={saving}
                  />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => void addDebt()} disabled={saving} data-testid="button-save-new-debt">
                      {saving ? "Saving…" : "Track this debt"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setAddingNew(false)} disabled={saving}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => setAddingNew(true)} data-testid="button-open-add-debt">
                  <Plus className="mr-1.5 h-4 w-4" /> Track a debt
                </Button>
              )
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
