import { useEffect, useState } from "react";
import {
  getGetDashboardCategoryBreakdownQueryKey,
  getGetDashboardCategoryLedgerQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetDashboardActivityQueryKey,
  getGetExpensesQueryKey,
  useGetDashboardCategoryBreakdown,
  useGetDashboardCategoryLedger,
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
import { ArrowLeft, ArrowRight, Loader2, Calendar, Target, Pencil, Trash2, Plus, SlidersHorizontal, WalletCards, ReceiptText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@workspace/replit-auth-web";

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
type IncomeSource = { id: number; userId: string; name: string; isMain: boolean; expectedMonthlyAmount: number };
type Member = { userId: string; userName?: string | null; role?: "owner" | "admin" | "member" };
type LedgerTarget = { category: string; isBudgeted: boolean };

const priorityMap: Record<number, string> = {
  1: "Survival Essentials",
  2: "Health & Education",
  3: "Essentials",
  4: "Connectivity & Grooming",
  5: "Discretionary",
  999: "Needs a budget",
};

const priorityGuide: Record<number, string> = {
  1: "Must-pay basics that keep the group safe and stable, such as food, housing, and core utilities.",
  2: "Protect health, learning, and other costs that should not be delayed.",
  3: "Keep the household running, such as transport and everyday supplies.",
  4: "Stay connected and cared for, including data, grooming, and similar regular costs.",
  5: "Flexible spending that can wait when money is tight.",
  999: "Spending recorded without a matching budget category yet.",
};

function CategoryDialog({
  open, onClose, initial, onSaved, reportMonth, reportYear, defaultPriority = 1,
}: {
  open: boolean;
  onClose: () => void;
  initial?: BudgetCategory | null;
  onSaved: () => void | Promise<void>;
  reportMonth: number;
  reportYear: number;
  defaultPriority?: number;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState(initial?.budgetAmount?.toString() ?? "");
  const [priority, setPriority] = useState(initial?.priority?.toString() ?? defaultPriority.toString());
  const [isRecurring, setIsRecurring] = useState(initial?.isRecurring ?? true);
  const [activeMonth, setActiveMonth] = useState(initial?.activeMonth ?? reportMonth);
  const [activeYear, setActiveYear] = useState(initial?.activeYear ?? reportYear);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(initial?.name ?? "");
    setAmount(initial?.budgetAmount?.toString() ?? "");
    setPriority(initial?.priority?.toString() ?? defaultPriority.toString());
    setIsRecurring(initial?.isRecurring ?? true);
    setActiveMonth(initial?.activeMonth ?? reportMonth);
    setActiveYear(initial?.activeYear ?? reportYear);
  }, [initial, open, reportMonth, reportYear, defaultPriority]);

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
            {initial ? (
              <p className="text-xs text-muted-foreground">
                Renaming keeps all existing expenses and tagged bank payments under the new name.
              </p>
            ) : null}
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
              {Object.entries(priorityMap).filter(([k]) => k !== "999").map(([k, v]) => (
                <option key={k} value={k}>Tier {k}: {v}</option>
              ))}
            </select>
            <div className="rounded-xl bg-muted/60 px-3 py-2.5">
              <p className="text-xs font-semibold text-foreground">How to use tiers</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Start with Tier 1 for must-pay needs, then work down to Tier 5 for spending that can wait. {priorityGuide[Number(priority)]}
              </p>
            </div>
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
  const { user } = useAuth();
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
      if (!res.ok) throw new Error("Could not load budget categories");
      const data: unknown = await res.json();
      if (!Array.isArray(data)) throw new Error("Could not load budget categories");
      return data as BudgetCategory[];
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
  const [addPriority, setAddPriority] = useState(1);
  const [manageOpen, setManageOpen] = useState(false);
  const [managePriority, setManagePriority] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BudgetCategory | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [ledgerCategory, setLedgerCategory] = useState<LedgerTarget | null>(null);
  const {
    data: ledger,
    isLoading: isLedgerLoading,
    isError: isLedgerError,
    refetch: refetchLedger,
  } = useGetDashboardCategoryLedger(
    {
      month,
      year,
      category: ledgerCategory?.category ?? "",
      isBudgeted: ledgerCategory?.isBudgeted ?? true,
    },
    {
      query: {
        queryKey: getGetDashboardCategoryLedgerQueryKey({
          month,
          year,
          category: ledgerCategory?.category ?? "",
          isBudgeted: ledgerCategory?.isBudgeted ?? true,
        }),
        enabled: !!ledgerCategory,
      },
      request: { cache: "no-store" },
    },
  );

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
      qc.invalidateQueries({ queryKey: getGetDashboardCategoryBreakdownQueryKey() }),
      qc.invalidateQueries({ queryKey: getGetExpensesQueryKey() }),
      qc.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() }),
      qc.invalidateQueries({ queryKey: ["budget-categories-full"] }),
    ]);
    await qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  };

  const openAddForPriority = (priority: number) => {
    setEditTarget(null);
    setAddPriority(priority);
    setAddOpen(true);
  };

  const openManage = (priority: number | null = null) => {
    setManagePriority(priority);
    setManageOpen(true);
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
  const saveExpectedIncome = async (source: IncomeSource, rawAmount: string) => {
    const expectedMonthlyAmount = Math.max(0, Math.round(Number(rawAmount) || 0));
    if (expectedMonthlyAmount === source.expectedMonthlyAmount) return;
    const response = await fetch(`/api/income-sources/${source.id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: source.name, isMain: source.isMain, expectedMonthlyAmount }),
    });
    if (!response.ok) {
      toast({ variant: "destructive", title: "Could not save expected income" });
      return;
    }
    toast({ title: "Expected monthly income saved" });
    refetchIncomeSources();
  };

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
  const canManageShared = members.some(
    (member) =>
      member.userId === user?.id &&
      (member.role === "owner" || member.role === "admin"),
  );
  const groupedIncomeSources = incomeSources.reduce((groups, source) => {
    const existing = groups.get(source.userId) ?? [];
    existing.push(source);
    groups.set(source.userId, existing);
    return groups;
  }, new Map<string, IncomeSource[]>());
  const ledgerEntries = ledger?.entries ?? [];
  const ledgerTotal = ledger?.total ?? 0;
  const ledgerBreakdown = breakdown?.find(category => category.category === ledgerCategory?.category);
  const ledgerCategoryTotal = ledgerBreakdown?.spentAmount ?? 0;

  return (
    <div className="space-y-8 pb-12">
      <CategoryDialog
        open={addOpen || !!editTarget}
        onClose={() => { setAddOpen(false); setEditTarget(null); }}
        initial={editTarget}
        onSaved={refreshAll}
        reportMonth={month}
        reportYear={year}
        defaultPriority={addPriority}
      />
      <Dialog open={manageOpen} onOpenChange={(open) => { setManageOpen(open); if (!open) setManagePriority(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{managePriority == null ? "Edit existing budgets" : `Edit Tier ${managePriority} budgets`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {(managePriority == null ? allCategories : allCategories.filter(category => category.priority === managePriority)).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No budget categories yet.</p>
            ) : (managePriority == null ? allCategories : allCategories.filter(category => category.priority === managePriority)).map(category => (
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
                  onClick={() => { setManageOpen(false); setManagePriority(null); setEditTarget(category); }}
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
      <Dialog open={!!ledgerCategory} onOpenChange={open => !open && setLedgerCategory(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{ledgerCategory?.category ?? "Category"} spending</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl bg-muted/60 px-4 py-3">
              <p className="text-sm font-semibold">{formatMonthYear(month, year)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isLedgerLoading
                  ? "Loading expenses for this category…"
                  : `${ledgerEntries.length} item${ledgerEntries.length === 1 ? "" : "s"} · ${formatKes(ledgerCategoryTotal)} spent`}
              </p>
            </div>
            {isLedgerLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              </div>
            ) : isLedgerError ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <p className="font-medium text-destructive">Could not load this category's expenses.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => refetchLedger()}>
                  Try again
                </Button>
              </div>
            ) : ledgerEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center">
                <ReceiptText className="mx-auto h-7 w-7 text-muted-foreground" />
                <p className="mt-3 font-medium">No spending recorded</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No {ledgerCategory?.category} spending was recorded in {formatMonthYear(month, year)}.
                </p>
              </div>
            ) : (
              <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                {ledgerEntries.map(entry => (
                  <div key={entry.id} className="flex items-start justify-between gap-4 rounded-xl border border-border/60 p-3.5">
                    <div className="min-w-0">
                      <p className="font-medium">{entry.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(`${entry.date.slice(0, 10)}T12:00:00`).toLocaleDateString("en-KE", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {" · "}{entry.payerName}
                        {ledgerCategory?.isBudgeted ? null : <>{" · "}{entry.category}</>}
                        {entry.source === "bank_disbursement" ? " · Joint bank disbursement" : null}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold">{formatKes(entry.amount)}</p>
                  </div>
                ))}
              </div>
            )}
            {!isLedgerLoading && !isLedgerError && ledgerEntries.length > 0 ? (
              <div className="flex items-center justify-between border-t pt-3 text-sm">
                <span className="text-muted-foreground">Expense ledger total</span>
                <span className="font-semibold">{formatKes(ledgerTotal)}</span>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLedgerCategory(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

       <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
         <div className="min-w-0">
          <h1 className="text-3xl font-display font-bold text-foreground">Budget Breakdown</h1>
          <p className="text-muted-foreground mt-1">Manage category limits and track spending.</p>
        </div>
         <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
           <div className="flex w-full items-center justify-between gap-2 rounded-xl border bg-card p-1 shadow-sm sm:w-auto">
            <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="h-10 w-10 rounded-lg hover:bg-muted">
              <ArrowLeft className="h-5 w-5 text-foreground/70" />
            </Button>
             <div className="min-w-0 flex-1 text-center font-display font-semibold sm:w-36 sm:flex-none">
               <span className="inline-flex items-center justify-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              {formatMonthYear(month, year)}
               </span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-10 w-10 rounded-lg hover:bg-muted" disabled={month === now.getMonth() + 1 && year === now.getFullYear()}>
              <ArrowRight className="h-5 w-5 text-foreground/70" />
            </Button>
          </div>
             {canManageShared && <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              <Button variant="outline" onClick={() => openManage()} className="w-full gap-2 sm:w-auto">
               <SlidersHorizontal className="w-4 h-4" /> Edit existing
             </Button>
               <Button onClick={() => openAddForPriority(1)} className="w-full gap-2 sm:w-auto">
               <Plus className="w-4 h-4" /> Add category
             </Button>
            </div>}
        </div>

       {!canManageShared && (
         <div className="rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
           Budget limits are managed by an admin. You can still review the plan and log your own spending.
         </div>
       )}
      </div>

       <Card className="border-none shadow-sm bg-card">
         <CardContent className="p-5">
           <div className="flex items-start justify-between gap-4 mb-4">
             <div>
               <p className="text-sm font-semibold text-foreground">Income streams</p>
                <p className="text-xs text-muted-foreground mt-0.5">Set each stream’s expected monthly income in KES</p>
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
                     {memberNames.get(userId) ?? "Group member"}
                   </p>
                   <div className="flex flex-wrap gap-2">
                      {sources.map(source => (
                        <div key={source.id} className="rounded-lg bg-primary/10 px-2.5 py-2 text-sm font-medium text-primary">
                          <div className="flex items-center gap-1.5">
                            {source.name}
                            {source.isMain ? <span className="text-[10px] uppercase tracking-wide opacity-70">Main</span> : null}
                          </div>
                          {canManageShared ? (
                            <Input
                              aria-label={`Expected monthly income for ${source.name}`}
                              type="number"
                              min="0"
                              defaultValue={source.expectedMonthlyAmount}
                              onBlur={(event) => saveExpectedIncome(source, event.target.value)}
                              className="mt-2 h-8 w-32 border-primary/20 bg-background text-xs"
                            />
                          ) : (
                            <p className="mt-1 text-xs font-normal text-primary/75">Expected {formatKes(source.expectedMonthlyAmount)}</p>
                          )}
                        </div>
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
            <div>
              <h2 className="font-display text-xl font-bold text-foreground">Priority tier report</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Compare your plan and actual spending from must-pay needs (Tier 1) to flexible spending (Tier 5).
              </p>
            </div>
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
                 <div className="border-b border-border/50 pb-3">
                    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                       <div className="flex w-full min-w-0 flex-col items-start gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
                         <h3 className="flex min-w-0 items-center gap-2 text-xl font-display font-bold text-foreground">
                          <Target className="w-5 h-5 text-secondary" />
                           <span className="break-words">Tier {priority}: {priorityMap[priority] ?? `Priority ${priority}`}</span>
                        </h3>
                        {canManageShared && (
                           <div className="flex shrink-0 items-center gap-2">
                             <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openAddForPriority(priority)}>
                              <Plus className="h-3.5 w-3.5" /> Add
                            </Button>
                            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openManage(priority)}>
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="w-full text-sm font-medium text-muted-foreground sm:w-auto sm:shrink-0 sm:text-right">
                        Actual {formatKes(groupSpent)} / Budget {formatKes(groupTotal)}
                     </div>
                   </div>
                   <p className="mt-1 text-sm text-muted-foreground">
                     {priorityGuide[priority] ?? "Use this tier to group spending with the same level of urgency."}
                   </p>
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
                              {canManageShared && fullCat && <>
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
                           <Button
                             variant="outline"
                             className="w-full justify-between"
                             onClick={() => setLedgerCategory({ category: cat.category, isBudgeted: cat.isBudgeted })}
                             data-testid={`budget-ledger-${cat.category}`}
                           >
                             <span className="flex items-center gap-2"><ReceiptText className="h-4 w-4" /> View spending</span>
                             <ArrowRight className="h-4 w-4" />
                           </Button>
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
                        <Button
                          variant="outline"
                          className="w-full justify-between"
                          onClick={() => setLedgerCategory({ category: cat.name, isBudgeted: true })}
                          data-testid={`budget-ledger-${cat.name}`}
                        >
                          <span className="flex items-center gap-2"><ReceiptText className="h-4 w-4" /> View spending</span>
                          <ArrowRight className="h-4 w-4" />
                        </Button>
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
