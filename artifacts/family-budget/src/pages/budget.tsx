import { useEffect, useState } from "react";
import {
  getGetDashboardCategoryBreakdownQueryKey,
  getGetDashboardSummaryQueryKey,
  useGetDashboardCategoryBreakdown,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatKes, formatMonthYear } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, ArrowRight, Loader2, Calendar, Target, Pencil, Trash2, Plus, SlidersHorizontal, WalletCards } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type BudgetCategory = {
  id: number;
  name: string;
  budgetAmount: number;
  priority: number;
  color: string;
  isRecurring: boolean;
  activeMonth?: number | null;
  activeYear?: number | null;
};
type IncomeSource = { id: number; userId: string; name: string; isMain: boolean };
type Member = { userId: string; userName?: string | null };

const priorityMap: Record<number, string> = {
  1: "Survival Essentials",
  2: "Health & Education",
  3: "Household",
  4: "Connectivity & Grooming",
  5: "Discretionary",
  999: "Needs a budget",
};

function CategoryDialog({
  open, onClose, initial, onSaved, reportMonth, reportYear,
}: {
  open: boolean;
  onClose: () => void;
  initial?: BudgetCategory | null;
  onSaved: () => void | Promise<void>;
  reportMonth: number;
  reportYear: number;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState(initial?.budgetAmount?.toString() ?? "");
  const [priority, setPriority] = useState(initial?.priority?.toString() ?? "1");
  const [isRecurring, setIsRecurring] = useState(initial?.isRecurring ?? true);
  const [activeMonth, setActiveMonth] = useState(initial?.activeMonth ?? reportMonth);
  const [activeYear, setActiveYear] = useState(initial?.activeYear ?? reportYear);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(initial?.name ?? "");
    setAmount(initial?.budgetAmount?.toString() ?? "");
    setPriority(initial?.priority?.toString() ?? "1");
    setIsRecurring(initial?.isRecurring ?? true);
    setActiveMonth(initial?.activeMonth ?? reportMonth);
    setActiveYear(initial?.activeYear ?? reportYear);
  }, [initial, open, reportMonth, reportYear]);

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
        body: JSON.stringify({
          name: name.trim(),
          budgetAmount: amt,
          priority: parseInt(priority, 10) || 1,
          isRecurring,
          activeMonth: isRecurring ? null : activeMonth,
          activeYear: isRecurring ? null : activeYear,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: initial ? "Category updated" : "Category added" });
      await onSaved();
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
            <label className="text-sm font-semibold">Budget amount (KES)</label>
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
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 p-3.5">
            <div>
              <p className="text-sm font-semibold">Recurring budget</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isRecurring
                  ? "Repeats every month"
                  : `Applies only to ${formatMonthYear(activeMonth, activeYear)}`}
              </p>
            </div>
            <Switch
              checked={isRecurring}
              onCheckedChange={(checked) => {
                setIsRecurring(checked);
                if (!checked && initial?.isRecurring !== false) {
                  setActiveMonth(reportMonth);
                  setActiveYear(reportYear);
                }
              }}
              aria-label="Recurring budget"
            />
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

  const {
    data: breakdown,
    isLoading,
    isFetching,
    refetch: refetchBreakdown,
  } = useGetDashboardCategoryBreakdown(
    { month, year },
    { request: { cache: "no-store" } },
  );
  const { data: allCategories = [], refetch: refetchCats } = useQuery<BudgetCategory[]>({
    queryKey: ["budget-categories-full"],
    queryFn: async () => {
      const res = await fetch("/api/budget-categories", { credentials: "include" });
      return res.json();
    },
    staleTime: 30_000,
  });
  const { data: incomeSources = [], refetch: refetchIncomeSources } = useQuery<IncomeSource[]>({
    queryKey: ["income-sources", "budget-report"],
    queryFn: async () => {
      const res = await fetch("/api/income-sources", { credentials: "include" });
      if (!res.ok) throw new Error("Could not load income streams");
      return res.json();
    },
    staleTime: 30_000,
  });
  const { data: members = [], refetch: refetchMembers } = useQuery<Member[]>({
    queryKey: ["members", "budget-report"],
    queryFn: async () => {
      const res = await fetch("/api/members", { credentials: "include" });
      if (!res.ok) throw new Error("Could not load members");
      return res.json();
    },
    staleTime: 30_000,
  });

  const [editTarget, setEditTarget] = useState<BudgetCategory | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BudgetCategory | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refreshAll = async () => {
    qc.removeQueries({
      queryKey: getGetDashboardCategoryBreakdownQueryKey(),
      type: "inactive",
    });
    await Promise.all([
      refetchCats(),
      refetchIncomeSources(),
      refetchMembers(),
      refetchBreakdown(),
    ]);
    await qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/budget-categories/${deleteTarget.id}`, { method: "DELETE", credentials: "include" });
      toast({ title: "Category removed" });
      setDeleteTarget(null);
      await refreshAll();
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
  const activeCategories = allCategories.filter(category =>
    category.isRecurring || (category.activeMonth === month && category.activeYear === year)
  );
  const unusedCats = activeCategories.filter(c => !catNamesInBreakdown.has(c.name));
  const unusedByPriority = unusedCats.reduce((acc, c) => {
    if (!acc[c.priority]) acc[c.priority] = [];
    acc[c.priority].push(c);
    return acc;
  }, {} as Record<number, BudgetCategory[]>);
  const reportBudget = (breakdown ?? []).reduce((sum, item) => sum + item.budgetAmount, 0);
  const reportActual = (breakdown ?? []).reduce((sum, item) => sum + item.spentAmount, 0);
  const reportVariance = reportBudget - reportActual;
  const memberNames = new Map(members.map(member => [member.userId, member.userName || "Member"]));
  const groupedIncomeSources = incomeSources.reduce((groups, source) => {
    const existing = groups.get(source.userId) ?? [];
    existing.push(source);
    groups.set(source.userId, existing);
    return groups;
  }, new Map<string, IncomeSource[]>());

  return (
    <div className="space-y-8 pb-12">
      <CategoryDialog
        open={addOpen || !!editTarget}
        onClose={() => { setAddOpen(false); setEditTarget(null); }}
        initial={editTarget}
        onSaved={refreshAll}
        reportMonth={month}
        reportYear={year}
      />
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit existing budgets</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {allCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No budget categories yet.</p>
            ) : allCategories.map(category => (
              <div key={category.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium truncate">{category.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatKes(category.budgetAmount)} · {category.isRecurring
                      ? "Recurring monthly"
                      : `One-time for ${formatMonthYear(category.activeMonth ?? month, category.activeYear ?? year)}`}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={() => { setManageOpen(false); setEditTarget(category); }}
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
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
           <div className="flex items-center gap-2">
             <Button variant="outline" onClick={() => setManageOpen(true)} className="gap-2">
               <SlidersHorizontal className="w-4 h-4" /> Edit existing
             </Button>
             <Button onClick={() => setAddOpen(true)} className="gap-2">
               <Plus className="w-4 h-4" /> Add category
             </Button>
           </div>
        </div>
      </div>

       <Card className="border-none shadow-sm bg-card">
         <CardContent className="p-5">
           <div className="flex items-start justify-between gap-4 mb-4">
             <div>
               <p className="text-sm font-semibold text-foreground">Income streams</p>
               <p className="text-xs text-muted-foreground mt-0.5">Named sources available to household members</p>
             </div>
             <WalletCards className="w-5 h-5 text-secondary" />
           </div>
           {incomeSources.length === 0 ? (
             <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center">
               <p className="text-sm font-medium">No income streams set up yet</p>
               <p className="text-xs text-muted-foreground mt-1">Add income sources from Settings on mobile.</p>
             </div>
           ) : (
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
               {Array.from(groupedIncomeSources.entries()).map(([userId, sources]) => (
                 <div key={userId} className="rounded-xl border border-border/60 p-3.5">
                   <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                     {memberNames.get(userId) ?? "Household member"}
                   </p>
                   <div className="flex flex-wrap gap-2">
                     {sources.map(source => (
                       <span key={source.id} className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary">
                         {source.name}
                         {source.isMain ? <span className="text-[10px] uppercase tracking-wide opacity-70">Main</span> : null}
                       </span>
                     ))}
                   </div>
                 </div>
               ))}
             </div>
           )}
         </CardContent>
       </Card>

       {!isLoading && (
         <Card className="border-none shadow-sm bg-card">
           <CardContent className="p-5">
             <div className="flex items-center justify-between gap-4 mb-4">
               <div>
                 <p className="text-sm font-semibold text-foreground">Budget vs actual</p>
                 <p className="text-xs text-muted-foreground mt-0.5">{formatMonthYear(month, year)} across all categories</p>
               </div>
               <Target className="w-5 h-5 text-primary" />
             </div>
             <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
               <div>
                 <p className="text-xs uppercase tracking-wide text-muted-foreground">Budget</p>
                 <p className="font-display font-bold text-xl text-foreground mt-1">{formatKes(reportBudget)}</p>
               </div>
               <div>
                 <p className="text-xs uppercase tracking-wide text-muted-foreground">Actual</p>
                 <p className={`font-display font-bold text-xl mt-1 ${reportActual > reportBudget ? "text-destructive" : "text-primary"}`}>{formatKes(reportActual)}</p>
               </div>
               <div>
                 <p className="text-xs uppercase tracking-wide text-muted-foreground">{reportVariance < 0 ? "Over budget" : "Remaining"}</p>
                 <p className={`font-display font-bold text-xl mt-1 ${reportVariance < 0 ? "text-destructive" : "text-primary"}`}>{formatKes(Math.abs(reportVariance))}</p>
               </div>
             </div>
           </CardContent>
         </Card>
       )}

               {isLoading || isFetching ? (
        <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 text-primary animate-spin" /></div>
      ) : (
        <div className="space-y-8">
           {Array.from(new Set([
             1,
             2,
             3,
             4,
             5,
             ...Object.keys(groupedBreakdown).map(Number),
           ])).sort((a, b) => a - b).map(priority => {
            const breakdownItems = groupedBreakdown[priority] ?? [];
            const unusedItems = unusedByPriority[priority] ?? [];
            if (breakdownItems.length === 0 && unusedItems.length === 0) return null;

             const groupTotal = breakdownItems.reduce((s, i) => s + i.budgetAmount, 0)
               + unusedItems.reduce((s, i) => s + i.budgetAmount, 0);
             const groupSpent = breakdownItems.reduce((s, i) => s + i.spentAmount, 0);

            return (
              <div key={priority} className="space-y-4">
                <div className="flex items-center justify-between border-b border-border/50 pb-2">
                  <h2 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
                    <Target className="w-5 h-5 text-secondary" />
                    Tier {priority}: {priorityMap[priority] ?? `Priority ${priority}`}
                  </h2>
                  <div className="text-sm font-medium text-muted-foreground">
                     Actual {formatKes(groupSpent)} / Budget {formatKes(groupTotal)}
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
                              <p className="text-sm text-muted-foreground">
                                {cat.isBudgeted
                                  ? <>Limit: {formatKes(cat.budgetAmount)} · {cat.isRecurring
                                    ? "Recurring"
                                    : `One-time for ${formatMonthYear(cat.activeMonth ?? month, cat.activeYear ?? year)}`}</>
                                  : "No active budget assigned"}
                              </p>
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
