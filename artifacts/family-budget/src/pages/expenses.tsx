import { useState } from "react";
import {
  useGetExpenses, useGetBudgetCategories, useGetMembers,
  useCreateExpense, useDeleteExpense, useApplyRecurringExpenses,
  getGetExpensesQueryKey, getGetDashboardSummaryQueryKey,
  getGetDashboardCategoryBreakdownQueryKey, getGetDashboardActivityQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatKes, formatDate, formatMonthYear } from "@/lib/utils";
import { Trash2, Plus, ArrowLeft, ArrowRight, Loader2, Calendar, RefreshCw, Repeat } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function Expenses() {
  const now = new Date();
  const { user } = useAuth();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const [isAdding, setIsAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [paidById, setPaidById] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [date, setDate] = useState(now.toISOString().split('T')[0]);

  const { data: expenses, isLoading } = useGetExpenses({ month, year });
  const { data: categories } = useGetBudgetCategories();
  const { data: members } = useGetMembers();
  const createExpense = useCreateExpense();
  const deleteExpense = useDeleteExpense();
  const applyRecurring = useApplyRecurringExpenses();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const { data: prevExpenses } = useGetExpenses({ month: prevMonth, year: prevYear });
  const recurringFromPrev = (prevExpenses ?? []).filter(e => e.isRecurring);
  const alreadyApplied = (expenses ?? []).some(e => e.isRecurring);
  const showRecurringBanner = recurringFromPrev.length > 0 && !alreadyApplied;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetExpensesQueryKey({ month, year }) });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey({ month, year }) });
    queryClient.invalidateQueries({ queryKey: getGetDashboardCategoryBreakdownQueryKey({ month, year }) });
    queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
  };

  const handlePrevMonth = () => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); };
  const handleNextMonth = () => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); };

  const resetForm = () => {
    setAmount(""); setCategory(""); setDescription(""); setNotes("");
    setPaidById(""); setIsRecurring(false);
    setDate(now.toISOString().split('T')[0]);
    setIsAdding(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !category || !description || !date) return;
    try {
      await createExpense.mutateAsync({
        data: {
          amount: Number(amount),
          category,
          description,
          notes: notes || undefined,
          paidById: paidById || undefined,
          isRecurring,
          date,
        }
      });
      toast({ title: "Expense recorded" });
      resetForm();
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to record expense." });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this expense?")) return;
    try {
      await deleteExpense.mutateAsync({ id });
      toast({ title: "Expense deleted" });
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete expense." });
    }
  };

  const handleApplyRecurring = async () => {
    try {
      const result = await applyRecurring.mutateAsync({ data: { month, year } });
      toast({ title: `${result.copied} recurring expense${result.copied === 1 ? '' : 's'} applied` });
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not apply recurring expenses." });
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Expenses</h1>
          <p className="text-muted-foreground mt-1">Track where the money is going.</p>
        </div>
        <div className="flex items-center gap-4 bg-card rounded-xl p-1 border shadow-sm">
          <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="h-10 w-10 rounded-lg hover:bg-muted">
            <ArrowLeft className="h-5 w-5 text-foreground/70" />
          </Button>
          <div className="w-36 text-center font-semibold font-display flex items-center justify-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            {formatMonthYear(month, year)}
          </div>
          <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-10 w-10 rounded-lg hover:bg-muted"
            disabled={month === now.getMonth() + 1 && year === now.getFullYear()}>
            <ArrowRight className="h-5 w-5 text-foreground/70" />
          </Button>
        </div>
      </div>

      {/* Recurring banner */}
      {showRecurringBanner && (
        <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Repeat className="w-5 h-5 text-primary shrink-0" />
            <p className="text-sm font-medium text-foreground">
              {recurringFromPrev.length} recurring expense{recurringFromPrev.length > 1 ? 's' : ''} from last month not yet added this month.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={handleApplyRecurring} disabled={applyRecurring.isPending} className="shrink-0">
            {applyRecurring.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
            Apply
          </Button>
        </div>
      )}

      {/* Add expense form */}
      {isAdding ? (
        <Card className="border-none shadow-md bg-accent/20">
          <CardContent className="p-6">
            <form onSubmit={handleCreate} className="space-y-6">
              <div className="flex items-center justify-between border-b border-border/50 pb-4">
                <h3 className="text-xl font-bold font-display text-foreground">Record New Expense</h3>
                <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Amount */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Amount (KES)</label>
                  <Input type="number" placeholder="e.g. 5000" value={amount} onChange={e => setAmount(e.target.value)}
                    required min="1" className="h-12 text-lg bg-card" />
                </div>

                {/* Category */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Category</label>
                  <select className="flex h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={category} onChange={e => setCategory(e.target.value)} required>
                    <option value="" disabled>Select category...</option>
                    {categories?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>

                {/* Description */}
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-semibold text-foreground">Description</label>
                  <Input placeholder="e.g. Nathan's Term 2 school fees" value={description}
                    onChange={e => setDescription(e.target.value)} required className="h-12 bg-card" />
                </div>

                {/* Notes */}
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-semibold text-foreground">Notes <span className="font-normal text-muted-foreground">(optional)</span></label>
                  <Input placeholder="Any extra details..." value={notes}
                    onChange={e => setNotes(e.target.value)} className="h-12 bg-card" />
                </div>

                {/* Date */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Date</label>
                  <Input type="date" value={date} onChange={e => setDate(e.target.value)} required className="h-12 bg-card" />
                </div>

                {/* Who paid */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Paid by</label>
                  <select className="flex h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={paidById} onChange={e => setPaidById(e.target.value)}>
                    <option value="">Me ({user?.name ?? 'You'})</option>
                    {members?.filter(m => m.userId !== user?.id).map(m => (
                      <option key={m.userId} value={m.userId}>{m.userName ?? m.userId}</option>
                    ))}
                  </select>
                </div>

                {/* Recurring toggle */}
                <div className="md:col-span-2 flex items-center gap-3 bg-card rounded-xl p-4 border border-border/50">
                  <input type="checkbox" id="isRecurring" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)}
                    className="w-5 h-5 accent-primary rounded" />
                  <div>
                    <label htmlFor="isRecurring" className="text-sm font-semibold text-foreground cursor-pointer flex items-center gap-2">
                      <Repeat className="w-4 h-4 text-primary" /> Recurring expense
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5">Mark to get a reminder to apply it next month (rent, fees, salaries…)</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={resetForm} className="h-12 px-6">Cancel</Button>
                <Button type="submit" disabled={createExpense.isPending} className="h-12 px-8">
                  {createExpense.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Save Expense
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Button onClick={() => setIsAdding(true)} className="h-12 px-6 rounded-xl shadow-sm">
          <Plus className="w-5 h-5 mr-2" /> Record Expense
        </Button>
      )}

      {/* Expense list */}
      {isLoading ? (
        <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 text-primary animate-spin" /></div>
      ) : !expenses || expenses.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Calendar className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No expenses for {formatMonthYear(month, year)}</p>
          <p className="text-sm mt-1">Click "Record Expense" to add the first one.</p>
        </div>
      ) : (
        <Card className="border-none shadow-md overflow-hidden">
          <div className="divide-y divide-border/50">
            {expenses.map((expense) => (
              <div key={expense.id} className="p-4 sm:p-5 flex items-start justify-between hover:bg-muted/20 transition-colors gap-4">
                <div className="flex items-start gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-accent/60 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-primary">{expense.category.slice(0, 2).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground">{expense.description}</p>
                      {expense.isRecurring && (
                        <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                          <Repeat className="w-3 h-3" /> Recurring
                        </span>
                      )}
                    </div>
                    {expense.notes && (
                      <p className="text-sm text-muted-foreground mt-0.5 italic">"{expense.notes}"</p>
                    )}
                    <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 bg-muted rounded text-xs font-medium">{expense.category}</span>
                      <span className="w-1 h-1 rounded-full bg-border"></span>
                      <span>{expense.paidByName}</span>
                      <span className="w-1 h-1 rounded-full bg-border"></span>
                      <span>{formatDate(expense.date)}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p className="font-display font-bold text-lg text-foreground">{formatKes(expense.amount)}</p>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9 w-9"
                    onClick={() => handleDelete(expense.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 bg-muted/30 border-t border-border/50 flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{expenses.length} expense{expenses.length !== 1 ? 's' : ''}</span>
            <span className="font-display font-bold text-primary">{formatKes(expenses.reduce((s, e) => s + e.amount, 0))}</span>
          </div>
        </Card>
      )}
    </div>
  );
}
