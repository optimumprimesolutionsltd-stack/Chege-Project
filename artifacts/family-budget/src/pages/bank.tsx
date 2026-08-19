import { useState } from "react";
import {
  useGetJointAccount, useCreateDeposit, useCreateDisbursement, useDeleteJointAccountTransaction,
  useGetMembers, useGetBudgetCategories, getGetJointAccountQueryKey, getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatKes, formatDate } from "@/lib/utils";
import { Trash2, ArrowDownLeft, ArrowUpRight, Loader2, Landmark, TrendingUp, TrendingDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

// "Joint bank" is represented as null — never implicitly attributed to the signed-in user.
const JOINT_BANK_ID = null as null;

type MemberIncomeSource = {
  id: number;
  name: string;
};

export default function Bank() {
  const { data: account, isLoading } = useGetJointAccount();
  const { data: members } = useGetMembers();
  const { data: categories } = useGetBudgetCategories();
  const createDeposit = useCreateDeposit();
  const createDisbursement = useCreateDisbursement();
  const deleteTx = useDeleteJointAccountTransaction();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<"deposit" | "disbursement" | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  // Deposit attribution — null = Joint bank, string[] = named member IDs
  // Default: Joint bank (empty array = no named depositors selected)
  const [depositorIds, setDepositorIds] = useState<string[]>([]);
  const [depositorAmounts, setDepositorAmounts] = useState<Record<string, string>>({});
  const [incomeSourceId, setIncomeSourceId] = useState<number | null>(null);

  // Withdrawal attribution — null = Joint bank, string = named member ID
  // Default: Joint bank
  const [withdrawerId, setWithdrawerId] = useState<string | null>(JOINT_BANK_ID);
  const [expenseCategory, setExpenseCategory] = useState("");

  // Income sources — only fetch when exactly one named depositor is selected
  const singleDepositorId = depositorIds.length === 1 ? depositorIds[0] : null;
  const { data: depositSources } = useQuery<MemberIncomeSource[]>({
    queryKey: ["income-sources", singleDepositorId],
    queryFn: async () => {
      if (!singleDepositorId) return [];
      const res = await fetch(`/api/income-sources?userId=${singleDepositorId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!singleDepositorId,
    staleTime: 60_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  };

  const resetForm = () => {
    setAmount("");
    setDescription("");
    setDate(new Date().toISOString().split("T")[0]);
    // Always reset to Joint bank — never silently attribute to the signed-in user
    setDepositorIds([]);
    setDepositorAmounts({});
    setIncomeSourceId(null);
    setWithdrawerId(JOINT_BANK_ID);
    setExpenseCategory("");
    setMode(null);
  };

  const openMode = (m: "deposit" | "disbursement") => {
    // Reset attribution to Joint bank every time a form opens
    setAmount("");
    setDescription("");
    setDate(new Date().toISOString().split("T")[0]);
    setDepositorIds([]);
    setDepositorAmounts({});
    setIncomeSourceId(null);
    setWithdrawerId(JOINT_BANK_ID);
    setExpenseCategory("");
    setMode(m);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description || !date) return;

    const total = Number(amount);
    if (!Number.isInteger(total) || total <= 0) {
      toast({
        variant: "destructive",
        title: "Enter a whole KES amount",
        description: "Bank transactions are recorded in whole shillings.",
      });
      return;
    }

    const isMultiDepositor = depositorIds.length > 1;

    if (mode === "deposit" && isMultiDepositor) {
      const splitAmounts = depositorIds.map((id) => Number(depositorAmounts[id] || 0));
      if (splitAmounts.some((portion) => !Number.isInteger(portion) || portion <= 0)) {
        toast({
          variant: "destructive",
          title: "Enter every depositor's amount",
          description: "Each portion must be a positive whole-shilling amount.",
        });
        return;
      }
      const splitTotal = splitAmounts.reduce((sum, portion) => sum + portion, 0);
      if (splitTotal !== total) {
        toast({
          variant: "destructive",
          title: "Amounts don't add up",
          description: `Portions total ${splitTotal} but deposit is ${total}.`,
        });
        return;
      }
    }

    try {
      if (mode === "deposit") {
        if (isMultiDepositor) {
          // Multiple named depositors — split into per-person deposits
          for (const did of depositorIds) {
            const portionAmt = Number(depositorAmounts[did] || 0);
            if (portionAmt <= 0) continue;
            await createDeposit.mutateAsync({
              data: {
                amount: portionAmt,
                description,
                date,
                madeById: did,
              },
            });
          }
        } else {
          // Single named depositor or Joint bank (null)
          const madeById = depositorIds.length === 1 ? depositorIds[0] : null;
          await createDeposit.mutateAsync({
            data: {
              amount: Number(amount),
              description,
              date,
              madeById,
              ...(madeById && incomeSourceId ? { incomeSourceId } : {}),
            },
          });
        }
        toast({ title: "Deposit recorded" });
      } else {
        await createDisbursement.mutateAsync({
          data: {
            amount: total,
            description,
            date,
            expenseCategory: expenseCategory || undefined,
            madeById: withdrawerId,
          },
        });
        toast({ title: "Disbursement recorded" });
      }
      resetForm();
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not save transaction." });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this transaction?")) return;
    try {
      await deleteTx.mutateAsync({ id });
      toast({ title: "Transaction deleted" });
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not delete transaction." });
    }
  };

  const isPending = createDeposit.isPending || createDisbursement.isPending;

  // Helpers for attribution labels in transaction list
  const madeByLabel = (madeByName: string | null | undefined, type: string) => {
    if (!madeByName) return "Joint bank";
    return madeByName;
  };

  return (
    <div className="space-y-8 pb-12 max-w-2xl">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Joint Bank Account</h1>
        <p className="text-muted-foreground mt-1">Track money going in and out of your shared account.</p>
      </div>

      {/* Balance card */}
      <Card className="border-none shadow-md bg-primary text-primary-foreground">
        <CardContent className="p-6">
          {isLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-8 h-8 animate-spin opacity-70" /></div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Landmark className="w-6 h-6 opacity-80" />
                <p className="text-sm font-medium opacity-80">Running Balance</p>
              </div>
              <p className="text-4xl font-display font-bold" data-testid="bank-balance">{formatKes(account?.balance ?? 0)}</p>
              <div className="flex gap-6 pt-2 border-t border-primary-foreground/20">
                <div>
                  <p className="text-xs opacity-70 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Total In</p>
                  <p className="text-lg font-semibold font-mono">{formatKes(account?.totalDeposits ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs opacity-70 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Total Out</p>
                  <p className="text-lg font-semibold font-mono">{formatKes(account?.totalDisbursements ?? 0)}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action buttons / form */}
      {!mode ? (
        <div className="flex gap-3">
          <Button
            data-testid="button-deposit"
            onClick={() => openMode("deposit")}
            className="h-12 px-6 rounded-xl flex-1"
          >
            <ArrowDownLeft className="w-5 h-5 mr-2" /> Deposit
          </Button>
          <Button
            data-testid="button-withdraw"
            onClick={() => openMode("disbursement")}
            variant="outline"
            className="h-12 px-6 rounded-xl flex-1"
          >
            <ArrowUpRight className="w-5 h-5 mr-2" /> Withdraw
          </Button>
        </div>
      ) : (
        <Card className="border-none shadow-md bg-accent/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-display">
              {mode === "deposit" ? "Add Money to Account" : "Take Money Out"}
            </CardTitle>
            <CardDescription>
              {mode === "deposit"
                ? "Money going into the joint bank account."
                : "Money going out of the joint bank account."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Amount (KES)</label>
                  <Input
                    data-testid="input-amount"
                    type="number"
                    placeholder="e.g. 20000"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    required
                    min="1"
                    step="1"
                    className="h-12 text-lg bg-card"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Date</label>
                  <Input
                    data-testid="input-date"
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    required
                    className="h-12 bg-card"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-semibold text-foreground">Description</label>
                  <Input
                    data-testid="input-description"
                    placeholder={mode === "deposit" ? "e.g. Salary deposit" : "e.g. Paid school fees"}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    required
                    className="h-12 bg-card"
                  />
                </div>

                {/* ── DEPOSIT: who is depositing ── */}
                {mode === "deposit" && (
                  <>
                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-sm font-semibold text-foreground">
                        Who is depositing?
                        <span className="font-normal text-muted-foreground text-xs ml-1">(select multiple to split)</span>
                      </label>
                      <div className="grid grid-cols-3 gap-2" data-testid="deposit-attribution">
                        {/* Joint bank chip — mutually exclusive with named members */}
                        <button
                          key="joint-bank"
                          type="button"
                          data-testid="chip-joint-bank-deposit"
                          onClick={() => {
                            setDepositorIds([]);
                            setIncomeSourceId(null);
                            setDepositorAmounts({});
                          }}
                          className={`h-12 rounded-xl border text-base font-semibold transition-colors ${
                            depositorIds.length === 0
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card border-input text-foreground hover:bg-muted/40"
                          }`}
                        >
                          Joint bank
                        </button>

                        {/* Named member chips */}
                        {(members ?? []).map(m => {
                          const name = m.userName?.split(' ')[0] ?? 'Member';
                          const selected = depositorIds.includes(m.userId);
                          return (
                            <button
                              key={m.userId}
                              type="button"
                              data-testid={`chip-depositor-${m.userId}`}
                              onClick={() => {
                                setDepositorIds(prev =>
                                  prev.includes(m.userId)
                                    ? prev.filter(id => id !== m.userId)
                                    : [...prev, m.userId]
                                );
                                setIncomeSourceId(null);
                              }}
                              className={`h-12 rounded-xl border text-base font-semibold transition-colors ${
                                selected
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-card border-input text-foreground hover:bg-muted/40"
                              }`}
                            >
                              {name}
                            </button>
                          );
                        })}
                      </div>

                      {/* Per-depositor split rows — only when multiple named depositors */}
                      {depositorIds.length > 1 && (() => {
                        const total = Number(amount) || 0;
                        const splitTotal = depositorIds.reduce((s, id) => s + (Number(depositorAmounts[id] || 0)), 0);
                        const diff = total - splitTotal;
                        return (
                          <div className="mt-3 space-y-2">
                            <p className="text-xs text-muted-foreground">
                              How much is each person depositing?{total > 0 ? ` (total: KES ${total.toLocaleString()})` : ""}
                            </p>
                            {depositorIds.map(did => {
                              const member = (members ?? []).find(m => m.userId === did);
                              const name = member?.userName?.split(' ')[0] ?? 'Member';
                              return (
                                <div key={did} className="flex items-center gap-3">
                                  <span className="text-sm font-semibold w-20 shrink-0">{name}</span>
                                  <input
                                    type="number"
                                    placeholder="0"
                                     min="1"
                                     step="1"
                                    data-testid={`input-depositor-amount-${did}`}
                                    value={depositorAmounts[did] ?? ""}
                                    onChange={e => setDepositorAmounts(prev => ({ ...prev, [did]: e.target.value }))}
                                    className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  />
                                </div>
                              );
                            })}
                            {Math.abs(diff) >= 1 && (
                              <p className={`text-xs font-medium ${diff > 0 ? "text-amber-500" : "text-destructive"}`}>
                                {diff > 0 ? `KES ${diff.toLocaleString()} still unassigned` : `Over by KES ${Math.abs(diff).toLocaleString()}`}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Income source — only for exactly one named depositor */}
                    {singleDepositorId && depositSources && depositSources.length > 0 && (
                      <div className="space-y-2 sm:col-span-2">
                        <label className="text-sm font-semibold text-foreground">
                          Where did this money come from?{" "}
                          <span className="font-normal text-muted-foreground">(optional)</span>
                        </label>
                        <select
                          data-testid="select-income-source"
                          className="flex h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          value={incomeSourceId?.toString() ?? ""}
                          onChange={e => setIncomeSourceId(e.target.value ? Number(e.target.value) : null)}
                        >
                          <option value="">Select an income source...</option>
                          {depositSources.map(src => (
                            <option key={src.id} value={src.id}>
                              {src.name}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                          Optional — select the source so the deposit is attributed to the right income stream.
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* ── WITHDRAWAL: who is withdrawing ── */}
                {mode === "disbursement" && (
                  <>
                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-sm font-semibold text-foreground">Who is withdrawing?</label>
                      <div className="grid grid-cols-3 gap-2" data-testid="withdrawal-attribution">
                        {/* Joint bank — default selection */}
                        <button
                          key="joint-bank"
                          type="button"
                          data-testid="chip-joint-bank-withdrawal"
                          onClick={() => setWithdrawerId(null)}
                          className={`h-12 rounded-xl border text-base font-semibold transition-colors ${
                            withdrawerId === null
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card border-input text-foreground hover:bg-muted/40"
                          }`}
                        >
                          Joint bank
                        </button>

                        {/* Named member chips — one at a time */}
                        {(members ?? []).map(m => {
                          const name = m.userName?.split(' ')[0] ?? 'Member';
                          const selected = withdrawerId === m.userId;
                          return (
                            <button
                              key={m.userId}
                              type="button"
                              data-testid={`chip-withdrawer-${m.userId}`}
                              onClick={() => setWithdrawerId(selected ? null : m.userId)}
                              className={`h-12 rounded-xl border text-base font-semibold transition-colors ${
                                selected
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-card border-input text-foreground hover:bg-muted/40"
                              }`}
                            >
                              {name}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-sm font-semibold text-foreground">
                        Category{" "}
                        <span className="font-normal text-muted-foreground">(optional — helps track what the money was used for)</span>
                      </label>
                      <select
                        data-testid="select-expense-category"
                        className="flex h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        value={expenseCategory}
                        onChange={e => setExpenseCategory(e.target.value)}
                      >
                        <option value="">No category</option>
                        {categories?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" variant="outline" onClick={resetForm} className="h-12 px-6">Cancel</Button>
                <Button type="submit" disabled={isPending} data-testid="button-save-transaction" className="h-12 px-8">
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Save
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Transaction list */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-10 h-10 text-primary animate-spin" /></div>
      ) : !account?.transactions?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Landmark className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No transactions yet</p>
          <p className="text-sm mt-1">Record a deposit or disbursement above.</p>
        </div>
      ) : (
        <Card className="border-none shadow-md overflow-hidden">
          <div className="divide-y divide-border/50">
            {account.transactions.map((tx) => {
              const isDeposit = tx.type === "deposit";
              const attribution = madeByLabel(tx.madeByName, tx.type);
              return (
                <div
                  key={tx.id}
                  data-testid={`transaction-row-${tx.id}`}
                  className="p-4 sm:p-5 flex items-center justify-between gap-4 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isDeposit ? "bg-green-100" : "bg-red-100"}`}>
                      {isDeposit
                        ? <ArrowDownLeft className="w-5 h-5 text-green-600" />
                        : <ArrowUpRight className="w-5 h-5 text-destructive" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{tx.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5" data-testid={`tx-meta-${tx.id}`}>
                        {isDeposit
                          ? `Deposited by ${attribution}`
                          : `Withdrawn by ${attribution}${tx.expenseCategory ? ` · ${tx.expenseCategory}` : ""}`}
                        {" · "}{formatDate(tx.date)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <p className={`font-display font-bold text-lg ${isDeposit ? "text-green-600" : "text-destructive"}`}>
                      {isDeposit ? "+" : "-"}{formatKes(tx.amount)}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      data-testid={`button-delete-tx-${tx.id}`}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9 w-9"
                      onClick={() => handleDelete(tx.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
