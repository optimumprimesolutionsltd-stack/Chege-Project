import { useState } from "react";
import {
  useGetSavingsGoals,
  useCreateSavingsGoal,
  useUpdateSavingsGoal,
  useDeleteSavingsGoal,
  useContributeToSavingsGoal,
  getGetSavingsGoalsQueryKey,
} from "@workspace/api-client-react";
import type { SavingsGoal } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatKes } from "@/lib/utils";
import {
  Plus,
  Loader2,
  Target,
  CheckCircle2,
  Pencil,
  Trash2,
  Calendar,
  Trophy,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

function GoalProgress({ current, target }: { current: number; target: number }) {
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="font-semibold text-foreground">{formatKes(current)}</span>
        <span className="text-muted-foreground">of {formatKes(target)}</span>
      </div>
      <div className="h-3 w-full bg-secondary/20 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${pct >= 100 ? "bg-emerald-500" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground text-right">{Math.round(pct)}% reached</p>
    </div>
  );
}

type GoalFormMode = "none" | "create" | { type: "edit"; goal: SavingsGoal };

export default function SavingsGoals() {
  const { data: goals, isLoading } = useGetSavingsGoals();
  const createGoal = useCreateSavingsGoal();
  const updateGoal = useUpdateSavingsGoal();
  const contributeToGoal = useContributeToSavingsGoal();
  const deleteGoal = useDeleteSavingsGoal();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<GoalFormMode>("none");

  // Form state
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [contributeId, setContributeId] = useState<number | null>(null);
  const [contributeAmount, setContributeAmount] = useState("");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getGetSavingsGoalsQueryKey() });

  const resetForm = () => {
    setName("");
    setTargetAmount("");
    setDeadline("");
    setMode("none");
  };

  const openCreate = () => {
    setName("");
    setTargetAmount("");
    setDeadline("");
    setMode("create");
  };

  const openEdit = (goal: SavingsGoal) => {
    setName(goal.name);
    setTargetAmount(String(goal.targetAmount));
    setDeadline(goal.deadline ?? "");
    setMode({ type: "edit", goal });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !targetAmount) return;

    try {
      if (mode === "create") {
        await createGoal.mutateAsync({
          data: {
            name,
            targetAmount: Number(targetAmount),
            deadline: deadline || undefined,
          },
        });
        toast({ title: "Goal created", description: `"${name}" has been added.` });
      } else if (typeof mode === "object" && mode.type === "edit") {
        await updateGoal.mutateAsync({
          id: mode.goal.id,
          data: {
            name,
            targetAmount: Number(targetAmount),
            deadline: deadline || null,
          },
        });
        toast({ title: "Goal updated" });
      }
      invalidate();
      resetForm();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Something went wrong." });
    }
  };

  const handleContribute = async (e: React.FormEvent, goal: SavingsGoal) => {
    e.preventDefault();
    const amount = Number(contributeAmount);
    if (!amount || amount <= 0) return;

    try {
      await contributeToGoal.mutateAsync({
        id: goal.id,
        data: { amount },
      });
      toast({ title: "Contribution added", description: `${formatKes(amount)} added to "${goal.name}".` });
      invalidate();
      setContributeId(null);
      setContributeAmount("");
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to add contribution." });
    }
  };

  const handleMarkComplete = async (goal: SavingsGoal) => {
    try {
      await updateGoal.mutateAsync({
        id: goal.id,
        data: { isCompleted: !goal.isCompleted },
      });
      toast({ title: goal.isCompleted ? "Goal reopened" : "Goal completed! 🎉" });
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to update goal." });
    }
  };

  const handleDelete = async (goal: SavingsGoal) => {
    if (!confirm(`Delete goal "${goal.name}"? This cannot be undone.`)) return;
    try {
      await deleteGoal.mutateAsync({ id: goal.id });
      toast({ title: "Goal deleted" });
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete goal." });
    }
  };

  const activeGoals = goals?.filter((g) => !g.isCompleted) ?? [];
  const completedGoals = goals?.filter((g) => g.isCompleted) ?? [];
  const isPending = createGoal.isPending || updateGoal.isPending;

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Savings Goals</h1>
          <p className="text-muted-foreground mt-1">
            Track shared targets — holidays, emergency funds, and more.
          </p>
        </div>
        {mode === "none" && (
          <Button
            onClick={openCreate}
            className="rounded-xl h-12 px-6 shadow-md hover:-translate-y-0.5 transition-transform"
          >
            <Plus className="w-5 h-5 mr-2" />
            New Goal
          </Button>
        )}
      </div>

      {/* Create / Edit Form */}
      {mode !== "none" && (
        <Card className="border-none shadow-md bg-accent/20">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="flex items-center justify-between border-b border-border/50 pb-4">
                <h3 className="text-xl font-bold font-display text-foreground">
                  {mode === "create" ? "New Savings Goal" : "Edit Goal"}
                </h3>
                <Button type="button" variant="ghost" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2 md:col-span-1">
                  <label className="text-sm font-semibold text-foreground">Goal Name</label>
                  <Input
                    placeholder="e.g. Holiday to Mombasa"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="h-12 bg-card"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Target Amount (KES)</label>
                  <Input
                    type="number"
                    placeholder="e.g. 150000"
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(e.target.value)}
                    required
                    min="1"
                    className="h-12 bg-card text-lg"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">
                    Deadline{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <Input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="h-12 bg-card"
                  />
                </div>
              </div>
              <div className="pt-2 flex justify-end">
                <Button
                  type="submit"
                  size="lg"
                  className="rounded-xl h-12 px-8"
                  disabled={isPending}
                >
                  {isPending ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <Plus className="w-5 h-5 mr-2" />
                  )}
                  {mode === "create" ? "Create Goal" : "Save Changes"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-48 bg-muted rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Active Goals */}
          {activeGoals.length === 0 && mode === "none" && (
            <Card className="border-none shadow-md">
              <CardContent className="p-12 text-center text-muted-foreground">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <Target className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <p className="text-lg font-medium text-foreground">No goals yet</p>
                <p className="text-sm mt-1">Create your first savings goal to start tracking.</p>
                <Button onClick={openCreate} className="mt-6 rounded-xl">
                  <Plus className="w-4 h-4 mr-2" /> New Goal
                </Button>
              </CardContent>
            </Card>
          )}

          {activeGoals.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {activeGoals.map((goal) => (
                <Card key={goal.id} className="border-none shadow-md overflow-hidden">
                  <CardHeader className="bg-muted/30 border-b border-border/50 pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Target className="w-5 h-5 text-primary shrink-0" />
                        <CardTitle className="text-lg leading-tight">{goal.name}</CardTitle>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => openEdit(goal)}
                          title="Edit goal"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-emerald-600"
                          onClick={() => handleMarkComplete(goal)}
                          title="Mark complete"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(goal)}
                          title="Delete goal"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    {goal.deadline && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>
                          Target by{" "}
                          {new Date(goal.deadline).toLocaleDateString("en-KE", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="p-6 space-y-5">
                    <GoalProgress current={goal.currentAmount} target={goal.targetAmount} />

                    {/* Contribute inline */}
                    {contributeId === goal.id ? (
                      <form
                        onSubmit={(e) => handleContribute(e, goal)}
                        className="flex gap-3 items-center"
                      >
                        <Input
                          type="number"
                          placeholder="Amount to add (KES)"
                          value={contributeAmount}
                          onChange={(e) => setContributeAmount(e.target.value)}
                          min="1"
                          required
                          className="h-10 bg-muted/40"
                          autoFocus
                        />
                        <Button
                          type="submit"
                          size="sm"
                          className="h-10 rounded-lg shrink-0"
                          disabled={contributeToGoal.isPending}
                        >
                          {contributeToGoal.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Add"
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-10 rounded-lg"
                          onClick={() => {
                            setContributeId(null);
                            setContributeAmount("");
                          }}
                        >
                          Cancel
                        </Button>
                      </form>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full h-10 rounded-xl font-semibold border-primary/20 text-primary hover:bg-primary/5"
                        onClick={() => {
                          setContributeId(goal.id);
                          setContributeAmount("");
                        }}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Contribution
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Completed Goals */}
          {completedGoals.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                Completed Goals
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {completedGoals.map((goal) => (
                  <Card
                    key={goal.id}
                    className="border-none shadow-sm opacity-70 bg-muted/30"
                  >
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                          <p className="font-semibold text-foreground">{goal.name}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => handleMarkComplete(goal)}
                            title="Reopen goal"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(goal)}
                            title="Delete goal"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Saved</span>
                        <span className="font-semibold text-emerald-600">
                          {formatKes(goal.currentAmount)} / {formatKes(goal.targetAmount)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
