import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useGetContributions, useCreateContribution, useGetDashboardSummary,
  getGetContributionsQueryKey, getGetDashboardSummaryQueryKey, getGetDashboardActivityQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatKes, formatDate, formatMonthYear } from "@/lib/utils";
import { Plus, Loader2, ArrowLeft, ArrowRight, PiggyBank, Calendar, Landmark, ChevronRight, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

// Income sources from the budget document
const INCOME_SOURCES: Record<string, { label: string; amount: number; description: string }[]> = {
  chege: [
    { label: "Ujenzi Salary", amount: 76140, description: "Monthly salary from Ujenzi family business" },
    { label: "Rental Income", amount: 150000, description: "Ujenzi premises rental income" },
    { label: "Optimum", amount: 40954, description: "Optimum personal business income" },
  ],
  lydiah: [
    { label: "EISH", amount: 50000, description: "EISH personal business income" },
  ],
};

export default function Contributions() {
  const now = new Date();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const [showCustom, setShowCustom] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [recordingSource, setRecordingSource] = useState<string | null>(null);

  const { data: contributions, isLoading } = useGetContributions({ month, year });
  const { data: summary } = useGetDashboardSummary({ month, year });
  const createContribution = useCreateContribution();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const firstName = (user?.firstName ?? "").toLowerCase();
  const isChege = firstName.includes("chege") || firstName.includes("george");
  const mySources = isChege ? INCOME_SOURCES.chege : INCOME_SOURCES.lydiah;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetContributionsQueryKey({ month, year }) });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey({ month, year }) });
    queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
  };

  const handlePrevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1);
  };
  const handleNextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1);
  };

  const quickRecord = async (sourceLabel: string, sourceAmount: number) => {
    setRecordingSource(sourceLabel);
    try {
      await createContribution.mutateAsync({
        data: { amount: sourceAmount, month, year, note: sourceLabel },
      });
      toast({ title: "Recorded", description: `${sourceLabel} — ${formatKes(sourceAmount)}` });
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to record contribution." });
    } finally {
      setRecordingSource(null);
    }
  };

  const handleCustomCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;
    try {
      await createContribution.mutateAsync({
        data: { amount: Number(amount), month, year, note: note || undefined },
      });
      toast({ title: "Contribution recorded" });
      setAmount(""); setNote(""); setShowCustom(false);
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to record contribution." });
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Contributions</h1>
          <p className="text-muted-foreground mt-1">Track income towards the joint budget.</p>
        </div>
        <div className="flex items-center gap-1 bg-card rounded-xl p-1 border shadow-sm">
          <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="h-10 w-10 rounded-lg hover:bg-muted">
            <ArrowLeft className="h-5 w-5 text-foreground/70" />
          </Button>
          <div className="flex items-center gap-1.5 px-1">
            <Calendar className="w-4 h-4 text-primary shrink-0" />
            <select
              value={`${year}-${String(month).padStart(2, "0")}`}
              onChange={e => {
                const [y, m] = e.target.value.split("-").map(Number);
                setYear(y); setMonth(m);
              }}
              className="font-semibold font-display text-sm text-foreground bg-transparent border-none outline-none cursor-pointer"
            >
              {Array.from({ length: 24 }, (_, i) => {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const m = d.getMonth() + 1; const y = d.getFullYear();
                return (
                  <option key={`${y}-${m}`} value={`${y}-${String(m).padStart(2, "0")}`}>
                    {formatMonthYear(m, y)}
                  </option>
                );
              })}
            </select>
          </div>
          <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-10 w-10 rounded-lg hover:bg-muted"
            disabled={month === now.getMonth() + 1 && year === now.getFullYear()}>
            <ArrowRight className="h-5 w-5 text-foreground/70" />
          </Button>
        </div>
      </div>

      {/* Member summary cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { name: "Chege", contributed: summary.chegeContributed, spent: summary.chegeSpent ?? 0, net: summary.chegeNet ?? 0, target: summary.chegeTarget, colorClass: "text-primary", bgClass: "bg-primary/10", barClass: "bg-primary" },
            { name: "Lydiah", contributed: summary.lydiahContributed, spent: summary.lydiahSpent ?? 0, net: summary.lydiahNet ?? 0, target: summary.lydiahTarget, colorClass: "text-secondary", bgClass: "bg-secondary/10", barClass: "bg-secondary" },
          ].map(({ name, contributed, spent, net, target, colorClass, bgClass, barClass }) => {
            const pct = target > 0 ? Math.min((contributed / target) * 100, 100) : 0;
            const netPos = net >= 0;
            return (
              <Card key={name} className="border-none shadow-md overflow-hidden">
                <CardContent className={`p-6 space-y-4 bg-gradient-to-br ${bgClass} to-transparent`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-display font-bold text-xl text-foreground">{name}</h3>
                      <p className="text-sm text-muted-foreground">Monthly target: {formatKes(target)}</p>
                    </div>
                    <div className={`w-10 h-10 ${bgClass} rounded-full flex items-center justify-center font-bold ${colorClass}`}>
                      {name[0]}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center bg-background/50 rounded-xl p-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Contributed</p>
                      <p className={`text-sm font-bold font-mono ${colorClass}`}>{formatKes(contributed)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Spent</p>
                      <p className="text-sm font-bold font-mono text-destructive">{formatKes(spent)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Net</p>
                      <p className={`text-sm font-bold font-mono ${netPos ? "text-green-600" : "text-destructive"}`}>
                        {netPos ? "+" : ""}{formatKes(net)}
                      </p>
                    </div>
                  </div>
                  <div>
                    <div className="h-2 w-full bg-muted/40 rounded-full overflow-hidden">
                      <div className={`h-full ${barClass} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 text-right">
                      {Math.round(pct)}% of target · {formatKes(Math.max(target - contributed, 0))} to go
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Record income section */}
      <div className="space-y-3">
        <h2 className="text-lg font-display font-bold text-foreground">Record Income</h2>
        <p className="text-sm text-muted-foreground -mt-1">
          Tap a source to record the full target amount instantly, or add a custom entry below.
        </p>

        {/* Deposit to Bank shortcut */}
        <button
          onClick={() => navigate("/bank")}
          className="w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors text-left group"
        >
          <div className="w-11 h-11 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center shrink-0">
            <Landmark className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground">Deposit to Bank</p>
            <p className="text-sm text-muted-foreground">Record a deposit into the joint bank account</p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>

        {/* Income source presets */}
        {mySources.map((source) => {
          const isRecording = recordingSource === source.label;
          // Check if already recorded this month
          const alreadyRecorded = contributions?.some(c => c.note === source.label) ?? false;
          return (
            <div
              key={source.label}
              className={`flex items-center gap-4 p-4 rounded-xl border bg-card transition-colors ${alreadyRecorded ? "border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20" : "border-border"}`}
            >
              <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground">{source.label}</p>
                  {alreadyRecorded && (
                    <span className="text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
                      Recorded
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Target: <span className="font-semibold text-foreground">{formatKes(source.amount)}</span>
                </p>
              </div>
              <Button
                size="sm"
                variant={alreadyRecorded ? "outline" : "default"}
                onClick={() => quickRecord(source.label, source.amount)}
                disabled={isRecording}
                className="shrink-0"
              >
                {isRecording ? <Loader2 className="w-4 h-4 animate-spin" /> : alreadyRecorded ? "Record again" : "Record"}
              </Button>
            </div>
          );
        })}

        {/* Other / custom */}
        {showCustom ? (
          <Card className="border-none shadow-md">
            <CardContent className="p-6">
              <form onSubmit={handleCustomCreate} className="space-y-5">
                <div className="flex items-center justify-between border-b border-border/50 pb-4">
                  <h3 className="text-lg font-bold font-display text-foreground">Other Income</h3>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowCustom(false)}>Cancel</Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground">Amount (KES)</label>
                    <Input
                      type="number" placeholder="e.g. 20000" value={amount}
                      onChange={e => setAmount(e.target.value)} required min="1"
                      className="h-12 text-lg bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground">Source / Note</label>
                    <Input
                      type="text" placeholder="e.g. Bonus, side hustle…" value={note}
                      onChange={e => setNote(e.target.value)} className="h-12 bg-background"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={createContribution.isPending} className="h-12 px-8">
                    {createContribution.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                    Save
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          <button
            onClick={() => setShowCustom(true)}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors text-left"
          >
            <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
              <Plus className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-primary">Other / Custom Amount</p>
              <p className="text-sm text-muted-foreground">Record income from a different source</p>
            </div>
          </button>
        )}
      </div>

      {/* History */}
      {!isLoading && contributions && contributions.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {contributions.length} {contributions.length === 1 ? "entry" : "entries"} this month ·{" "}
            {formatKes(contributions.reduce((s, c) => s + c.amount, 0))} total
          </p>
        </div>
      )}

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
              <p className="text-sm mt-1">Use the sources above to record income.</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="px-6 py-4 font-semibold">Date</th>
                  <th className="px-6 py-4 font-semibold">Who</th>
                  <th className="px-6 py-4 font-semibold">Source</th>
                  <th className="px-6 py-4 font-semibold text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {contributions.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">{formatDate(item.createdAt)}</td>
                    <td className="px-6 py-4 font-medium text-foreground">{item.userName}</td>
                    <td className="px-6 py-4 text-muted-foreground">{item.note || "—"}</td>
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
