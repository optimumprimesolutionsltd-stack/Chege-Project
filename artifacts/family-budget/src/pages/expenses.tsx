import { useState } from "react";
import { useGetExpenses, useGetBudgetCategories, useCreateExpense, useDeleteExpense } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatKes, formatDate, formatMonthYear } from "@/lib/utils";
import { Trash2, Plus, ArrowLeft, ArrowRight, Loader2, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetExpensesQueryKey, getGetDashboardSummaryQueryKey, getGetDashboardCategoryBreakdownQueryKey, getGetDashboardActivityQueryKey } from "@workspace/api-client-react";

export default function Expenses() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  
  const [isAdding, setIsAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(now.toISOString().split('T')[0]);

  const { data: expenses, isLoading } = useGetExpenses({ month, year });
  const { data: categories } = useGetBudgetCategories();
  
  const createExpense = useCreateExpense();
  const deleteExpense = useDeleteExpense();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handlePrevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
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
          date
        }
      });
      
      toast({
        title: "Expense recorded",
        description: "Successfully added new expense.",
      });
      
      setAmount("");
      setDescription("");
      setIsAdding(false);
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: getGetExpensesQueryKey({ month, year }) });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey({ month, year }) });
      queryClient.invalidateQueries({ queryKey: getGetDashboardCategoryBreakdownQueryKey({ month, year }) });
      queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to record expense.",
      });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this expense?")) return;
    
    try {
      await deleteExpense.mutateAsync({ id });
      
      toast({
        title: "Expense deleted",
      });
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: getGetExpensesQueryKey({ month, year }) });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey({ month, year }) });
      queryClient.invalidateQueries({ queryKey: getGetDashboardCategoryBreakdownQueryKey({ month, year }) });
      queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete expense.",
      });
    }
  };

  return (
    <div className="space-y-8 pb-12">
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
          <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-10 w-10 rounded-lg hover:bg-muted" disabled={month === now.getMonth() + 1 && year === now.getFullYear()}>
            <ArrowRight className="h-5 w-5 text-foreground/70" />
          </Button>
        </div>
      </div>

      {isAdding ? (
        <Card className="border-none shadow-md bg-accent/20">
          <CardContent className="p-6">
            <form onSubmit={handleCreate} className="space-y-6">
              <div className="flex items-center justify-between border-b border-border/50 pb-4">
                <h3 className="text-xl font-bold font-display text-foreground">Record New Expense</h3>
                <Button type="button" variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Amount (KES)</label>
                  <Input 
                    type="number" 
                    placeholder="e.g. 5000" 
                    value={amount} 
                    onChange={e => setAmount(e.target.value)}
                    required
                    min="1"
                    className="h-12 text-lg bg-card"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Category</label>
                  <select 
                    className="flex h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    required
                  >
                    <option value="" disabled>Select category...</option>
                    {categories?.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-semibold text-foreground">Description</label>
                  <Input 
                    type="text" 
                    placeholder="e.g. Weekly groceries at Naivas" 
                    value={description} 
                    onChange={e => setDescription(e.target.value)}
                    required
                    className="h-12 bg-card text-base"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Date</label>
                  <Input 
                    type="date" 
                    value={date} 
                    onChange={e => setDate(e.target.value)}
                    required
                    className="h-12 bg-card"
                  />
                </div>
              </div>
              <div className="pt-4 flex justify-end">
                <Button type="submit" size="lg" className="rounded-xl h-12 px-8" disabled={createExpense.isPending}>
                  {createExpense.isPending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Plus className="w-5 h-5 mr-2" />}
                  Save Expense
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Button onClick={() => setIsAdding(true)} size="lg" className="rounded-xl h-14 w-full border-2 border-dashed border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 shadow-none font-bold text-lg transition-colors">
          <Plus className="w-6 h-6 mr-2" />
          Record New Expense
        </Button>
      )}

      <Card className="border-none shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : !expenses || expenses.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <p className="text-lg font-medium text-foreground">No expenses this month</p>
              <p>You're either very frugal or need to record something.</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="px-6 py-4 font-semibold">Date</th>
                  <th className="px-6 py-4 font-semibold">Description</th>
                  <th className="px-6 py-4 font-semibold">Category</th>
                  <th className="px-6 py-4 font-semibold">Paid By</th>
                  <th className="px-6 py-4 font-semibold text-right">Amount</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {expenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                      {formatDate(expense.date)}
                    </td>
                    <td className="px-6 py-4 font-medium text-foreground">
                      {expense.description}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary/10 text-secondary-foreground border border-secondary/20">
                        {expense.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {expense.paidByName}
                    </td>
                    <td className="px-6 py-4 text-right font-display font-bold text-foreground whitespace-nowrap text-base">
                      {formatKes(expense.amount)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleDelete(expense.id)}
                        disabled={deleteExpense.isPending}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 -mr-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}