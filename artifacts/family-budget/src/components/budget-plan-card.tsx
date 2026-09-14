import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { budgetDurationEditError, budgetDurationLabels, type BudgetDurationType } from "@/lib/budget-plan";
import { Loader2, Target } from "lucide-react";

type BudgetPlan = {
  id: number;
  purpose: string | null;
  durationType: BudgetDurationType;
  startDate: string;
  endDate: string | null;
};

/**
 * Onboarding's purpose and duration were write-only until now: no route read
 * them back, and nothing let anyone change their mind. Categories and income
 * streams stay editable where they already are (Budget); this only ever
 * covered the two fields nothing else lets you touch.
 */
export function BudgetPlanCard({ canManage, isShared }: { canManage: boolean; isShared: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const durationLabels = budgetDurationLabels(isShared);
  const [editing, setEditing] = useState(false);
  const [purposeDraft, setPurposeDraft] = useState("");
  const [durationDraft, setDurationDraft] = useState<BudgetDurationType>("ongoing");
  const [endDateDraft, setEndDateDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: plan, isLoading } = useQuery<BudgetPlan | null>({
    queryKey: ["budget-plan-current"],
    queryFn: async () => {
      const response = await fetch("/api/budget-plans/current", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load your budget setup.");
      return response.json() as Promise<BudgetPlan | null>;
    },
  });

  if (!isLoading && !plan) return null;

  const startEditing = () => {
    setPurposeDraft(plan?.purpose ?? "");
    setDurationDraft(plan?.durationType ?? "ongoing");
    setEndDateDraft(plan?.endDate ?? "");
    setEditing(true);
  };

  const save = async () => {
    const validationError = budgetDurationEditError(durationDraft, endDateDraft);
    if (validationError) {
      toast({ variant: "destructive", title: "Check the budget duration", description: validationError });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/budget-plans/current", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: purposeDraft.trim() || null,
          durationType: durationDraft,
          endDate: durationDraft === "custom" ? endDateDraft : null,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not update your budget setup.");
      await queryClient.invalidateQueries({ queryKey: ["budget-plan-current"] });
      setEditing(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not update your budget setup",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-none shadow-md">
      <CardHeader className="p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <CardTitle>Budget setup</CardTitle>
        </div>
        <CardDescription>What this budget is for, and how long it runs — set during onboarding, editable here.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 px-4 pb-4 sm:px-6 sm:pb-6">
        {isLoading ? (
          <div className="flex min-h-16 items-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : !editing ? (
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">{plan?.purpose ? plan.purpose : "No purpose set"}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {durationLabels[plan!.durationType].title}
                {plan?.durationType === "custom" && plan.endDate ? ` · ends ${plan.endDate}` : ""}
              </p>
            </div>
            {canManage ? (
              <Button type="button" variant="outline" size="sm" onClick={startEditing} data-testid="button-edit-budget-plan">
                Edit
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label htmlFor="budget-plan-purpose" className="text-sm font-semibold text-foreground">What is this budget for?</label>
              <Input
                id="budget-plan-purpose"
                data-testid="input-budget-plan-purpose"
                value={purposeDraft}
                onChange={(event) => setPurposeDraft(event.target.value)}
                placeholder="Optional"
                maxLength={80}
                disabled={saving}
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-foreground">How long does it run?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(durationLabels) as BudgetDurationType[]).map((value) => {
                  const selected = durationDraft === value;
                  const { title, description } = durationLabels[value];
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={selected}
                      disabled={saving}
                      onClick={() => setDurationDraft(value)}
                      data-testid={`button-budget-plan-duration-${value}`}
                      className={`rounded-xl border p-3 text-left transition-colors ${selected ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border bg-card hover:border-primary/50 hover:bg-muted/50"}`}
                    >
                      <span className="block text-sm font-semibold text-foreground">{title}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            {durationDraft === "custom" ? (
              <div className="max-w-sm space-y-2">
                <label htmlFor="budget-plan-end-date" className="text-sm font-semibold text-foreground">End date</label>
                <Input
                  id="budget-plan-end-date"
                  data-testid="input-budget-plan-end-date"
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={endDateDraft}
                  onChange={(event) => setEndDateDraft(event.target.value)}
                  disabled={saving}
                />
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button type="button" onClick={() => void save()} disabled={saving} data-testid="button-save-budget-plan">
                {saving ? "Saving…" : "Save budget setup"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
