import { useState } from "react";
import { useGetContributions, useCreateContribution, useGetDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatKes, formatDate, formatMonthYear } from "@/lib/utils";
import { Plus, Loader2, ArrowLeft, ArrowRight, PiggyBank, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetContributionsQueryKey, getGetDashboardSummaryQueryKey, getGetDashboardActivityQueryKey } from "@workspace/api-client-react";

export default function Contributions() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  
  const [isAdding, setIsAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const { data: contributions, isLoading } = useGetContributions({ month, year });
  const { data: summary } = useGetDashboardSummary({ month, year });
  
  const createContribution = useCreateContribution();
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
    if (!amount) return;

    try {
      await createContribution.mutateAsync({
        data: {
          amount: Number(amount),
          month,
          year,
          note: note || undefined
        }
      });
      
      toast({
        title: "Deposit recorded",
        description: "Successfully added contribution.",
      });
      
      setAmount("");
      setNote("");
      setIsAdding(false);
      
      queryClient.invalidateQueries({ queryKey: getGetContributionsQueryKey({ month, year }) });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey({ month, year }) });
      queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to record contribution.",
      });
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Contributions</h1>
          <p className="text-muted-foreground mt-1">Record deposits towards the joint budget.</p>
        </div>
        
        <div className="flex items-center gap-1 bg-card rounded-xl p-1 border shadow-sm">
          <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="h-10 w-10 rounded-lg hover:bg-muted">
            <ArrowLeft className="h-5 w-5 text-foreground/70" />
          </Button>
          <div className="flex items-center gap-1.5 px-1">
            <Calendar className="w-4 h-4 text-primary shrink-0" />
            <select
              value={`${year}-${String(month).padStart(2, '0')}`}
              onChange={e => {
                const [y, m] = e.target.value.split('-').map(Number);
                setYear(y);
                setMonth(m);
              }}
              className="font-semibold font-display text-sm text-foreground bg-transparent border-none outline-none cursor-pointer"
            >
              {Array.from({ length: 24 }, (_, i) => {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const m = d.getMonth() + 1;
                const y = d.getFullYear();
                return (
                  <option key={`${y}-${m}`} value={`${y}-${String(m).padStart(2, '0')}`}>
                    {formatMonthYear(m, y)}
                  </option>
                );
              })}
            </select>
          </div>
          <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-10 w-10 rounded-lg hover:bg-muted" disabled={month === now.getMonth() + 1 && year === now.getFullYear()}>
            <ArrowRight className="h-5 w-5 text-foreground/70" />
          </Button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-none shadow-md bg-gradient-to-br from-primary/10 to-primary/5">
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-display font-bold text-xl text-foreground">Chege</h3>
                  <p className="text-sm text-muted-foreground">Monthly Target: {formatKes(summary.chegeTarget)}</p>
                </div>
                <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold">C</div>
              </div>
              <div className="text-3xl font-display font-bold text-primary mb-2">
                {formatKes(summary.chegeContributed)}
              </div>
              <div className="h-2 w-full bg-primary/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${Math.min((summary.chegeContributed / summary.chegeTarget) * 100 || 0, 100)}%` }}
                />
              </div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-md bg-gradient-to-br from-secondary/10 to-secondary/5">
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-display font-bold text-xl text-foreground">Lydiah</h3>
                  <p className="text-sm text-muted-foreground">Monthly Target: {formatKes(summary.lydiahTarget)}</p>
                </div>
                <div className="w-10 h-10 bg-secondary/20 rounded-full flex items-center justify-center text-secondary font-bold">L</div>
              </div>
              <div className="text-3xl font-display font-bold text-secondary mb-2">
                {formatKes(summary.lydiahContributed)}
              </div>
              <div className="h-2 w-full bg-secondary/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-secondary rounded-full"
                  style={{ width: `${Math.min((summary.lydiahContributed / summary.lydiahTarget) * 100 || 0, 100)}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isAdding ? (
        <Card className="border-none shadow-md bg-accent/20">
          <CardContent className="p-6">
            <form onSubmit={handleCreate} className="space-y-6">
              <div className="flex items-center justify-between border-b border-border/50 pb-4">
                <h3 className="text-xl font-bold font-display text-foreground">Record Deposit</h3>
                <Button type="button" variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Amount (KES)</label>
                  <Input 
                    type="number" 
                    placeholder="e.g. 20000" 
                    value={amount} 
                    onChange={e => setAmount(e.target.value)}
                    required
                    min="1"
                    className="h-12 text-lg bg-card"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Note (Optional)</label>
                  <Input 
                    type="text" 
                    placeholder="e.g. Bonus from work" 
                    value={note} 
                    onChange={e => setNote(e.target.value)}
                    className="h-12 bg-card text-base"
                  />
                </div>
              </div>
              <div className="pt-4 flex justify-end">
                <Button type="submit" size="lg" className="rounded-xl h-12 px-8" disabled={createContribution.isPending}>
                  {createContribution.isPending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Plus className="w-5 h-5 mr-2" />}
                  Save Deposit
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Button onClick={() => setIsAdding(true)} size="lg" className="rounded-xl h-14 w-full border-2 border-dashed border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 shadow-none font-bold text-lg transition-colors">
          <Plus className="w-6 h-6 mr-2" />
          Record New Deposit
        </Button>
      )}

      {!isLoading && contributions && contributions.length > 0 && (() => {
        const total = contributions.reduce((sum, c) => sum + c.amount, 0);
        const byPerson: Record<string, { name: string; amount: number }> = {};
        contributions.forEach(c => {
          if (byPerson[c.userId]) {
            byPerson[c.userId].amount += c.amount;
          } else {
            byPerson[c.userId] = { name: c.userName, amount: c.amount };
          }
        });
        const personBreakdown = Object.values(byPerson)
          .map(({ name, amount }) => `${name} ${formatKes(amount)}`)
          .join(" · ");
        return (
          <p className="text-sm text-muted-foreground">
            {contributions.length} {contributions.length === 1 ? "contribution" : "contributions"} · {formatKes(total)} total
            {personBreakdown && (
              <span className="text-muted-foreground/70"> ({personBreakdown})</span>
            )}
          </p>
        );
      })()}

      <Card className="border-none shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : !contributions || contributions.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <PiggyBank className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <p className="text-lg font-medium text-foreground">No contributions this month yet</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="px-6 py-4 font-semibold">Date Recorded</th>
                  <th className="px-6 py-4 font-semibold">Who</th>
                  <th className="px-6 py-4 font-semibold">Note</th>
                  <th className="px-6 py-4 font-semibold text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {contributions.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                      {formatDate(item.createdAt)}
                    </td>
                    <td className="px-6 py-4 font-medium text-foreground">
                      {item.userName}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {item.note || "-"}
                    </td>
                    <td className="px-6 py-4 text-right font-display font-bold text-primary whitespace-nowrap text-base">
                      +{formatKes(item.amount)}
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