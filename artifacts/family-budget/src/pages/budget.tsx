import { useState } from "react";
import { useGetDashboardCategoryBreakdown } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatKes, formatMonthYear } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, ArrowRight, Loader2, Calendar, Target, Pencil, Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type BudgetCategory = { id: number; name: string; budgetAmount: number; priority: number; color: string };

const priorityMap: Record<number, string> = {
  1: "Survival Essentials",
  2: "Health & Education",
  3: "Household",
  4: "Connectivity & Grooming",
  5: "Discretionary",
};

function CategoryDialog({
  open, onClose, initial, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial?: BudgetCategory | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState(initial?.budgetAmount?.toString() ?? "");
  const [priority, setPriority] = useState(initial?.priority?.toString() ?? "1");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const amt = parseInt(amount, 10);
    if (!name.trim() || isNaN(amt) || amt < 0) {
      toast({ variant: "destructive", title: "Missing fields", description: "Name and a valid amount are required." });
      return;
    }
    setSaving(true);
    try {
      const url = initial ? `/api/budget-categories/${initial.id}` : "/api/budget-categories";
      const res = await fetch(url, {
        method: initial ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), budgetAmount: amt, priority: parseInt(priority, 10) || 1 }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: initial ? "Category updated" : "Category added" });
      onSaved();
      onClose();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not save category." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit category" : "Add category"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">Category name</label>
            <Input placeholder="e.g. Transport" value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">Monthly budget (KES)</label>
            <Input type="number" placeholder="e.g. 15000" min="0" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">Priority tier</label>
            <select
              className="w-full h-10 rounded-md border border-input bg-card px-3 text-sm"
              value={priority}
              onChange={e => setPriority(e.target.value)}
            >
              {Object.entries(priorityMap).map(([k, v]) => (
                <option key={k} value={k}>Tier {k}: {v}</option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {initial ? "Save changes" : "Add category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Budget() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: breakdown, isLoading } = useGetDashboardCategoryBreakdown({ month, year });
  const { data: allCategories = [], refetch: refetchCats } = useQuery<BudgetCategory[]>({
    queryKey: ["budget-categories-full"],
    queryFn: async () => {
      const res = await fetch("/api/budget-categories", { credentials: "include" });
      return res.json();
    },
    staleTime: 30_000,
  });

  const [editTarget, setEditTarget] = useState<BudgetCategory | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BudgetCategory | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refreshAll = () => {
    refetchCats();
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/budget-categories/${deleteTarget.id}`, { method: "DELETE", credentials: "include" });
      toast({ title: "Category removed" });
      setDeleteTarget(null);
      refreshAll();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not remove category." });
    } finally {
      setDeleting(false);
    }
  };

  const handlePrevMonth = () => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); };
  const handleNextMonth = () => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); };

  const groupedBreakdown = breakdown ? breakdown.reduce((acc, item) => {
    if (!acc[item.priority]) acc[item.priority] = [];
    acc[item.priority].push(item);
    return acc;
  }, {} as Record<number, typeof breakdown>) : {};

  // Categories that exist but have no spending this month (show budget-only row)
  const catNamesInBreakdown = new Set((breakdown ?? []).map(b => b.category));
  const unusedCats = allCategories.filter(c => !catNamesInBreakdown.has(c.name));
  const unusedByPriority = unusedCats.reduce((acc, c) => {
    if (!acc[c.priority]) acc[c.priority] = [];
    acc[c.priority].push(c);
    return acc;
  }, {} as Record<number, BudgetCategory[]>);

  return (
    <div className="space-y-8 pb-12">
      <CategoryDialog
        open={addOpen || !!editTarget}
        onClose={() => { setAddOpen(false); setEditTarget(null); }}
        initial={editTarget}
        onSaved={refreshAll}
      />
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the budget limit. Existing expenses in this category are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Budget Breakdown</h1>
          <p className="text-muted-foreground mt-1">Manage category limits and track spending.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-card rounded-xl p-1 border shadow-sm">
            <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="h-10 w-10 rounded-lg hover:bg-muted">
              <ArrowLeft className="h-5 w-5 text-foreground/70" />
            </Button>
            <div className="w-36 text-center font-semibold font-display flex items-center justify-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              {formatMonthYear(month, year)}
            </div>
            <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-10 w-10 rounded-lg hover:bg-muted" disabled={month === now.getMonth() + 1 && year === now.getFullYear()}>
              <ArrowRight className="h-5 w-5 text-foreground/70" />
            </Button>
          </div>
          <Button onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Add category
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 text-primary animate-spin" /></div>
      ) : (
        <div className="space-y-8">
          {[1, 2, 3, 4, 5].map(priority => {
            const breakdownItems = groupedBreakdown[priority] ?? [];
            const unusedItems = unusedByPriority[priority] ?? [];
            if (breakdownItems.length === 0 && unusedItems.length === 0) return null;

            const allItems = breakdownItems;
            const groupTotal = allItems.reduce((s, i) => s + i.budgetAmount, 0);
            const groupSpent = allItems.reduce((s, i) => s + i.spentAmount, 0);

            return (
              <div key={priority} className="space-y-4">
                <div className="flex items-center justify-between border-b border-border/50 pb-2">
                  <h2 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
                    <Target className="w-5 h-5 text-secondary" />
                    Tier {priority}: {priorityMap[priority] ?? `Priority ${priority}`}
                  </h2>
                  <div className="text-sm font-medium text-muted-foreground">
                    {formatKes(groupSpent)} / {formatKes(groupTotal)}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {breakdownItems.map(cat => {
                    const isOver = cat.percentUsed > 100;
                    const isNear = cat.percentUsed > 85 && !isOver;
                    const fullCat = allCategories.find(c => c.name === cat.category);
                    return (
                      <Card key={cat.category} className="border-none shadow-sm bg-card hover:shadow-md transition-shadow">
                        <CardContent className="p-5 space-y-4">
                          <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-lg text-foreground">{cat.category}</h3>
                              <p className="text-sm text-muted-foreground">Limit: {formatKes(cat.budgetAmount)}</p>
                            </div>
                            <div className="flex items-start gap-1 ml-2">
                              <div className="text-right mr-2">
                                <p className={`font-display font-bold text-lg ${isOver ? "text-destructive" : "text-primary"}`}>{formatKes(cat.spentAmount)}</p>
                                <p className="text-xs font-medium text-muted-foreground">
                                  {isOver ? <span className="text-destructive">Over by {formatKes(Math.abs(cat.remaining))}</span> : <span>{formatKes(cat.remaining)} left</span>}
                                </p>
                              </div>
                              {fullCat && <>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setEditTarget(fullCat)}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(fullCat)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </>}
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Progress value={Math.min(cat.percentUsed, 100)} indicatorColor={isOver ? "hsl(var(--destructive))" : isNear ? "hsl(var(--secondary))" : cat.color || "hsl(var(--primary))"} className="h-2" />
                            <div className="flex justify-end text-xs font-medium text-muted-foreground">{Math.round(cat.percentUsed)}%</div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {unusedItems.map(cat => (
                    <Card key={cat.id} className="border-none shadow-sm bg-card/60 hover:shadow-md transition-shadow opacity-70">
                      <CardContent className="p-5 space-y-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-semibold text-lg text-foreground">{cat.name}</h3>
                            <p className="text-sm text-muted-foreground">Limit: {formatKes(cat.budgetAmount)} · No spending yet</p>
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setEditTarget(cat)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(cat)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                        <Progress value={0} className="h-2" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
