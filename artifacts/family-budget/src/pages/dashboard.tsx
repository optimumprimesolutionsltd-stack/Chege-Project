                           }}
                                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                                >
                                  <option value="" disabled>Add another income source...</option>
                                  {availableSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
                                </select>
                              )}
                              <p className="text-xs font-normal leading-relaxed text-muted-foreground">
                                Keep adding funding sources until the remaining amount reaches zero.
                              </p>
                            </div>
                          ) : null;
                        })()}
                         {additionalDirectPortions.map((portion, index) => {
                           const source = incomeSources.find((item) => item.id === portion.sourceId);
                           return (
                             <div key={portion.sourceId} className="space-y-1.5 rounded-lg border border-border/60 bg-card p-2">
                               <span className="block min-w-0 truncate text-sm font-semibold">{source?.name ?? "Income source"}</span>
                               <div className="flex items-center gap-2">
                                 <Input
                                   autoFocus={index === additionalDirectPortions.length - 1}
                                   type="number"
                                   min="1"
                                   step="1"
                                   value={portion.amount}
                                   onChange={(event) => setAdditionalDirectPortions((previous) => previous.map((item, itemIndex) =>
                                     itemIndex === index ? { ...item, amount: event.target.value } : item,
                                   ))}
                                   placeholder="KES 0"
                                   className="h-10 min-w-0 flex-1 bg-card"
                                 />
                                 <Button type="button" size="sm" variant="ghost" onClick={() => setAdditionalDirectPortions((previous) => previous.filter((_, itemIndex) => itemIndex !== index))}>
                                   Remove
                                 </Button>
                               </div>
                             </div>
                           );
                         })}
                      </div>
                   )}
                   <p className="text-xs text-muted-foreground">
                     Paid directly means this expense is linked to the selected income source and does not reduce any Jamvi bank-account balance.
                   </p>
                    {payerId && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {isAddingSource ? (
                          <>
                            <Input
                              autoFocus
                              placeholder="e.g. Freelance work"
                              value={newSourceName}
                              onChange={e => setNewSourceName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void handleAddSource();
                                }
                              }}
                              className="h-10 w-52 bg-card"
                            />
                            <Button type="button" size="sm" className="h-10" onClick={() => void handleAddSource()}>
                              Save source
                            </Button>
                            <Button type="button" size="sm" variant="ghost" className="h-10" onClick={() => { setIsAddingSource(false); setNewSourceName(""); }}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button type="button" size="sm" variant="outline" className="h-10 border-dashed" onClick={() => setIsAddingSource(true)}>
                            + New source
                          </Button>
                        )}
                      </div>
                    )}
                 </div>
               )}
             </div>
            ))}
          </div>
          {paidFromBank && (
            <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/70 p-3 dark:border-sky-900 dark:bg-sky-950/40">
              <label className="text-sm font-semibold text-foreground">
                Bank account <span className="text-destructive">*</span>
              </label>
              <select
                value={selectedBankAccountId?.toString() ?? ""}
                onChange={(event) => setSelectedBankAccountId(event.target.value ? Number(event.target.value) : null)}
                className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                 <option value="">{bankAccounts.length ? "Choose the account used" : "Create a bank account below"}</option>
                {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
               {selectedBankAccountId && (
                 <label className="block space-y-1.5 text-sm font-semibold text-foreground">
                   Type the amount from this account to confirm
                   <Input
                     type="number"
                     min="1"
                     step="1"
                     value={bankPortion}
                     onChange={(event) => setBankPortion(event.target.value)}
                     placeholder="KES 0"
                     className="h-11 bg-card"
                     data-testid="quick-expense-bank-amount"
                   />
                   <span className="block text-xs font-normal leading-relaxed text-muted-foreground">
                     Enter the full expense amount to confirm how much should reduce the selected account.
                   </span>
                 </label>
               )}
              <p className="text-xs leading-relaxed text-muted-foreground">
                Jamvi will record a withdrawal from this account. The money should already exist there as an opening balance or recorded deposit.
              </p>
               {bankAccounts.length === 0 && (
                 <p className="text-xs font-medium text-foreground">No bank account yet. Create one below and Jamvi will select it for this expense automatically.</p>
               )}
              {isAddingBankAccount ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input
                    autoFocus
                    value={newBankAccountName}
                    onChange={(event) => setNewBankAccountName(event.target.value)}
                    placeholder="e.g. M-Pesa wallet or KCB account"
                    className="h-10 bg-card"
                  />
                  <Input value={newBankAccountNumber} onChange={(event) => setNewBankAccountNumber(event.target.value)} placeholder="Account number (optional)" className="h-10 bg-card" />
                  <Input type="number" min="0" step="1" value={newBankOpeningBalance} onChange={(event) => setNewBankOpeningBalance(event.target.value)} placeholder="Opening balance (KES)" className="h-10 bg-card" />
                  <Button type="button" size="sm" className="h-10" onClick={() => void handleAddBankAccount()} disabled={createBankAccount.isPending}>
                    {createBankAccount.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Add account
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-10" onClick={() => { setIsAddingBankAccount(false); setNewBankAccountName(""); setNewBankAccountNumber(""); setNewBankOpeningBalance(""); }}>
                    Cancel
                  </Button>
                </div>
              ) : (
                 <Button type="button" size="sm" variant="outline" className="h-10 border-dashed" onClick={() => setIsAddingBankAccount(true)} data-testid="create-bank-account-inline-dashboard">
                   {bankAccounts.length === 0 ? "Create bank account" : "+ New bank account"}
                </Button>
              )}
              {projectedExpenseBankBalance !== null && projectedExpenseBankBalance < 0 && (
                <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100" role="alert" data-testid="quick-expense-negative-bank-warning">
                  <span className="flex items-center gap-1.5 font-semibold"><Flag className="h-3.5 w-3.5 fill-current" /> This will take the account below zero.</span>{" "}
                  Projected closing balance: {formatKes(projectedExpenseBankBalance)}. Jamvi will still save the expense.
                </div>
              )}
              {!allowMixedFunding ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-10 border-sky-300 bg-white/70 text-sky-800 hover:bg-white dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200"
                  onClick={() => setAllowMixedFunding(true)}
                  data-testid="quick-expense-add-funding-source"
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add another funding source
                </Button>
              ) : (
                <p className="text-xs font-medium text-sky-800 dark:text-sky-200">
                  Choose the payer and income source above. Only the bank portion reduces this account.
                </p>
              )}
            </div>
          )}
          <div className="flex justify-end">
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input type="checkbox" checked={isRecurring} onChange={e => {
              if (!e.target.checked) {
                setIsRecurring(false);
                setRecurringMonthlyBudget("");
                return;
              }
              if (window.confirm("Make this a recurring expense? Jamvi will take you to Budget to ask for the average monthly amount.")) {
                openRecurringBudgetSetup();
                if (isOtherCategory) setSaveOtherAsCategory(true);
              }
            }} className="mt-0.5 h-4 w-4 accent-primary" />
            <span>
              <span className="font-semibold">Recurring expense</span>
              <span className="block text-xs text-muted-foreground">Remind me to apply this next month.</span>
            </span>
          </label>
          </div>
          {isRecurring && (
            <label className="block space-y-1.5 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm font-semibold text-foreground">
              Monthly budget (KES) <span className="text-destructive">*</span>
              <Input type="number" min="1" step="1" value={recurringMonthlyBudget} onChange={(event) => setRecurringMonthlyBudget(event.target.value)} placeholder="e.g. 15000" required className="h-11 bg-card" data-testid="recurring-monthly-budget" />
              <span className="block text-xs font-normal text-muted-foreground">This becomes the recurring monthly budget for the selected category.</span>
            </label>
          )}
           {expenseTotal > 0 && (
             <div
               role="status"
               aria-live="polite"
               data-testid="quick-expense-funding-summary"
               className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                 fundingStatus.tone === "ready"
                   ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                   : fundingStatus.tone === "error"
                     ? "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                     : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
               }`}
             >
               {fundingStatus.message}
             </div>
           )}
        </div>
      </div>
        </>
      )}
      <div className="flex gap-3">
        <Button
          type="submit"
          className="h-11 rounded-xl bg-warning px-6 text-warning-foreground hover:bg-warning/90"
          disabled={createExpense.isPending || (formMode === "normal" && (isIncomeSourcesLoading || !normalIncomeSource))}
        >
          {createExpense.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Log Expense
        </Button>
        <Button type="button" variant="ghost" className="h-11" onClick={onDone}>Cancel</Button>
      </div>
      <AlertDialog open={uncategorizedSaveOpen} onOpenChange={setUncategorizedSaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save without a category?</AlertDialogTitle>
            <AlertDialogDescription>
              This expense will be recorded but will not count toward a monthly budget category.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                setUncategorizedSaveOpen(false);
                void handleSubmit({ preventDefault() {} } as React.FormEvent, true);
              }}
            >
              Save without category
            </AlertDialogAction>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                openRecurringBudgetSetup(false, description);
              }}
            >
              Create a monthly budget
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

// ── Quick Action: Save to Goal ───────────────────────────────────────────────
function GoalForm({
  goals,
  onDone,
  memberUserId,
}: {
  goals: SavingsGoal[] | undefined;
  onDone: () => void;
  memberUserId?: string;
}) {
  const activeGoals = goals?.filter(g => !g.isCompleted) ?? [];
  const [amount, setAmount] = useState("");
  const [selectedGoalId, setSelectedGoalId] = useState<"cascade" | number>(
    activeGoals.length === 1 ? activeGoals[0].id : "cascade"
  );
  const [cascadeResult, setCascadeResult] = useState<{ goalName: string; allocated: number; completed: boolean }[]>([]);
  const contributeToGoal = useContributeToSavingsGoal();
  const cascadeContribute = useCascadeContribute();
  const qc = useQueryClient();
  const { toast } = useToast();

  const isPending = contributeToGoal.isPending || cascadeContribute.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast({
        variant: "destructive",
        title: "Enter a valid amount",
        description: "Add a whole amount greater than zero before saving to a goal.",
      });
      return;
    }
    if (!Number.isInteger(amt)) {
      toast({
        variant: "destructive",
        title: "Enter a whole KES amount",
        description: "Savings contributions are recorded in whole shillings.",
      });
      return;
    }

    try {
      if (selectedGoalId === "cascade") {
        const result = await cascadeContribute.mutateAsync({ data: { amount: amt } });
        setCascadeResult(result.allocations);
        const completed = result.allocations.filter(a => a.completed).length;
        toast({
          title: `${formatKes(amt)} distributed`,
          description: completed > 0 ? `${completed} goal${completed > 1 ? "s" : ""} completed! 🎉` : `Spread across ${result.allocations.length} goal${result.allocations.length !== 1 ? "s" : ""}.`,
        });
      } else {
        const goal = activeGoals.find(g => g.id === selectedGoalId);
        await contributeToGoal.mutateAsync({
          id: selectedGoalId,
          data: { amount: amt, ...(memberUserId ? { userId: memberUserId } : {}) },
        });
        toast({ title: "Saved!", description: `${formatKes(amt)} added to "${goal?.name}".` });
        onDone();
      }
      qc.invalidateQueries({ queryKey: getGetSavingsGoalsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not save to goal." });
    }
  };

  if (activeGoals.length === 0) {
    return (
      <div className="flex items-center gap-4">
        <p className="text-sm text-muted-foreground">No active savings goals yet.</p>
        <Link href="/savings-goals"><Button variant="outline" size="sm" className="rounded-lg" onClick={onDone}>Create a goal →</Button></Link>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
      </div>
    );
  }

  if (cascadeResult.length > 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">How it was split</p>
        {cascadeResult.map((a, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            <ChevronRight className="w-4 h-4 text-primary shrink-0" />
            <span className="flex-1 font-medium text-foreground">{a.goalName}</span>
            <span className="font-bold text-primary">{formatKes(a.allocated)}</span>
            {a.completed && <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">Complete! 🎉</span>}
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={onDone} className="mt-1">Done</Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">Goal</label>
          <select
            value={selectedGoalId}
            onChange={e => setSelectedGoalId(e.target.value === "cascade" ? "cascade" : Number(e.target.value))}
            className="w-full h-11 rounded-lg border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {activeGoals.length > 1 && <option value="cascade">Distribute across all goals (waterfall)</option>}
            {activeGoals.map(g => {
              const needed = g.targetAmount - g.currentAmount;
              return <option key={g.id} value={g.id}>{g.name} — {formatKes(needed)} needed</option>;
            })}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">Amount (KES)</label>
          <Input type="number" placeholder="e.g. 10000" value={amount} onChange={e => setAmount(e.target.value)} min="1" required className="h-11 bg-card text-base" autoFocus />
        </div>
      </div>
      <div className="flex gap-3">
        <Button type="submit" className="h-11 rounded-xl bg-info px-6 text-info-foreground hover:bg-info/90" disabled={isPending}>
          {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Save
        </Button>
        <Button type="button" variant="ghost" className="h-11" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const [selectedPeriod, setSelectedPeriod] = useState({ month: currentMonth, year: currentYear });
  const { month, year } = selectedPeriod;
  const [location] = useLocation();
  const requestedQuickAction = getQuickActionFromLocation(location);
  const [activeAction, setActiveAction] = useState<QuickAction>(() => requestedQuickAction ?? "none");
  const { user } = useAuth();
  const [deleteTarget, setDeleteTarget] = useState<DashboardDeleteTarget | null>(null);
  const deleteExpense = useDeleteExpense();
  const qc = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!requestedQuickAction) return;
    setActiveAction(requestedQuickAction);
    const url = new URL(window.location.href);
    url.searchParams.delete("quick");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    const focusTimer = window.setTimeout(() => {
      document.getElementById("dashboard-quick-actions")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [requestedQuickAction]);

  useEffect(() => {
    const handleQuickLog = (event: Event) => {
      const action = (event as CustomEvent<Exclude<QuickAction, "none">>).detail;
      if (action !== "income" && action !== "expense" && action !== "goal") return;
      setActiveAction(action);
      window.setTimeout(() => {
        document.getElementById("dashboard-quick-actions")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 0);
    };
    window.addEventListener("jamvi:quick-log", handleQuickLog);
    return () => window.removeEventListener("jamvi:quick-log", handleQuickLog);
  }, []);

  const { data: summary, isLoading: isSummaryLoading, isError: isSummaryError } = useGetDashboardSummary({ month, year });
  const { data: activity, isLoading: isActivityLoading } = useGetDashboardActivity();
  const { data: monthlyExpenses = [] } = useGetExpenses({ month, year });
  const { data: group } = useGetGroup();
  const isSharedWorkspace = group?.isPrivate === false;
  const { data: breakdown, isLoading: isBreakdownLoading } = useGetDashboardCategoryBreakdown(
    { month, year },
    { query: { enabled: isSharedWorkspace, queryKey: getGetDashboardCategoryBreakdownQueryKey({ month, year }) } },
  );
  const { data: trends, isLoading: isTrendsLoading } = useGetDashboardTrends(
    { months: 6 },
    { query: { enabled: isSharedWorkspace, queryKey: getGetDashboardTrendsQueryKey({ months: 6 }) } },
  );
  const { data: goals } = useGetSavingsGoals();
  const { data: bankAccount } = useGetJointAccount();
  const { data: members = [] } = useGetMembers();
  // The group response may be cached across an invitation acceptance. A live
  // two-person member list is enough to enable the form; the API still checks
  // eligibility again before it records any shared money.
  const sharedTransactionsLocked =
    group?.canRecordSharedTransactions === false && members.length < 2;
  const canManageSetup = members.some(
    (member) =>
      member.userId === user?.id &&
      (member.role === "owner" || member.role === "admin"),
  );
  const canManageShared = isSharedWorkspace && canManageSetup;
  const canManageCategories = group?.isPrivate === true || canManageShared;
  const canManageExpenses = group?.isPrivate === true || canManageShared;
  const canManageBank = canManageBankAccount(group);
  const budgetName = group?.isPrivate ? "Personal budget" : group ? workspaceLabel(group) : "Shared budget";
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const editableUncategorizedExpenses = (monthlyExpenses as DashboardExpense[])
    .filter(isUncategorizedExpense)
    .filter((expense) => {
      if (canManageExpenses) return true;
      if (!user?.id || expense.date.slice(0, 10) !== today || expense.paidById !== user.id) return false;
      if (expense.paidFromBank || expense.isRecurring) return false;
      return !(expense.incomeSplits ?? []).some(
        (split) => split.fromBank || (split.userId && split.userId !== user.id),
      );
    });

  const removeDashboardExpense = async () => {
    if (!deleteTarget || deleteExpense.isPending) return;
    try {
      await deleteExpense.mutateAsync({ id: deleteTarget.id });
      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetDashboardCategoryBreakdownQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetDashboardTrendsQueryKey({ months: 6 }) }),
        qc.invalidateQueries({ queryKey: getGetExpensesQueryKey() }),
      ]);
      setDeleteTarget(null);
      toast({ title: "Expense removed", description: `${deleteTarget.description} was removed from this budget.` });
    } catch {
      toast({
        variant: "destructive",
        title: "Could not remove expense",
        description: "Refresh the dashboard and try again.",
      });
    }
  };

  // Compute this-month totals from the transactions array
  const monthlyDeposited = bankAccount?.transactions
    .filter(t => {
      const d = new Date(t.date);
      return t.type === "deposit" && d.getFullYear() === year && d.getMonth() + 1 === month;
    })
    .reduce((s, t) => s + t.amount, 0) ?? 0;
  const monthlyDisbursed = bankAccount?.transactions
    .filter(t => {
      const d = new Date(t.date);
      return t.type === "disbursement" && d.getFullYear() === year && d.getMonth() + 1 === month;
    })
    .reduce((s, t) => s + t.amount, 0) ?? 0;

  const activeGoals = goals?.filter((g) => !g.isCompleted) ?? [];
  const nearestGoal = activeGoals.length > 0
    ? activeGoals.slice().sort((a, b) => {
        if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        if (a.deadline) return -1;
        if (b.deadline) return 1;
        return (b.currentAmount / b.targetAmount) - (a.currentAmount / a.targetAmount);
      })[0]
    : null;

  const toggle = (action: QuickAction) =>
    setActiveAction(prev => prev === action ? "none" : action);

  if (isSummaryLoading || isActivityLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-20 bg-muted rounded-2xl"></div>
        <div className="h-48 bg-muted rounded-2xl"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-64 bg-muted rounded-2xl"></div>
          <div className="h-64 bg-muted rounded-2xl"></div>
        </div>
      </div>
    );
  }

  if (isSummaryError) {
    return (
      <div className="min-h-[55vh] flex items-center justify-center">
        <Card className="max-w-xl w-full border border-primary/20 shadow-lg overflow-hidden">
          <CardContent className="p-7 sm:p-9 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl mx-auto">🏠</div>
            <h1 className="font-display font-bold text-2xl text-foreground mt-5">Join this group first</h1>
            <p className="text-muted-foreground mt-2 leading-relaxed">
              Jamvi keeps each group’s shared funds, budgets, and savings goals private. Ask someone already in this group to add you from Settings.
            </p>
            <Link href="/settings">
              <Button className="mt-6 rounded-xl">Open Settings</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!summary || !activity) return null;

  const percentSpent = summary.totalBudget > 0 ? (summary.totalSpent / summary.totalBudget) * 100 : 0;
  const isOverBudget = percentSpent > 100;
  const overBudgetCategories = isSharedWorkspace
    ? (breakdown ?? []).filter((category) => category.remaining < 0)
    : [];
  const chartData = isSharedWorkspace
    ? (breakdown ?? [])
        .filter((category) => category.spentAmount > 0)
        .sort((a, b) => b.spentAmount - a.spentAmount)
        .slice(0, 6)
        .map((category) => ({
          name: category.category,
          value: category.spentAmount,
          color: category.color || "hsl(var(--primary))",
        }))
    : [];
  const workspaceAccentColor = group?.accentColor ?? "#003383";
  return (
    <div className="min-w-0 overflow-x-hidden space-y-6 pb-12 sm:space-y-8">
      <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
        <Home className="h-3.5 w-3.5" aria-hidden="true" />
        Home · Start here
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <ProfileAvatar user={user} className="h-12 w-12 sm:h-14 sm:w-14" textClassName="text-lg" alt={user?.firstName ?? "User"} />
          <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">
            {isSharedWorkspace ? "Shared budget" : "Personal budget"}
          </p>
          <h1 className="mt-1 text-2xl font-display font-bold text-foreground sm:text-3xl">
            {group?.isPrivate ? "Personal overview" : "Group overview"}
          </h1>
           <DashboardMonthNavigator
             month={month}
             year={year}
             currentMonth={currentMonth}
             currentYear={currentYear}
             onChange={setSelectedPeriod}
           />
          </div>
        </div>

        <section
          aria-labelledby="dashboard-workspace-heading"
          className="w-full rounded-2xl border bg-card p-4 shadow-sm sm:max-w-sm"
          style={{
            borderColor: `${workspaceAccentColor}80`,
            background: `linear-gradient(135deg, ${workspaceAccentColor}20 0%, hsl(var(--card)) 62%)`,
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                id="dashboard-workspace-heading"
                className="text-xs font-bold uppercase tracking-[0.15em]"
                style={{ color: workspaceAccentColor }}
              >
                Viewing budget
              </p>
              <p className={`mt-1 break-words text-lg text-foreground ${workspaceNameClass(group?.nameStyle)}`}>
                {group ? workspaceLabel(group) : "Personal budget"}
              </p>
            </div>
            <span
              className="hidden shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold sm:inline-flex"
              style={{
                backgroundColor: `${workspaceAccentColor}20`,
                borderColor: `${workspaceAccentColor}60`,
                color: workspaceAccentColor,
              }}
            >
              {isSharedWorkspace ? "Shared" : "Personal"}
            </span>
          </div>
          <label htmlFor="dashboard-workspace-switcher" className="sr-only">
             Choose a budget
          </label>
          <WorkspaceSwitcher
            id="dashboard-workspace-switcher"
            activeWorkspaceId={group?.id}
            variant="dashboard"
            showPendingLabel
            className="mt-3 w-full"
          />
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Switching refreshes balances, goals, and activity for the selected budget.
          </p>
        </section>
      </div>

      <AskJamviPanel month={month} year={year} workspaceName={group?.name ?? undefined} />

      {editableUncategorizedExpenses.length > 0 && (
        <section
          aria-labelledby="uncategorized-expenses-heading"
          aria-live="polite"
          data-testid="uncategorized-expense-cta"
          className="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm dark:border-amber-800 dark:bg-amber-950/35 sm:p-5"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100">
              <BellRing className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-amber-800 dark:text-amber-200">Needs your attention</p>
              <h2 id="uncategorized-expenses-heading" className="mt-1 font-display text-lg font-bold text-foreground">
                {editableUncategorizedExpenses.length} expense{editableUncategorizedExpenses.length === 1 ? "" : "s"} waiting for a category
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Categorize these expenses so category budgets and reports show where the money went.
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {editableUncategorizedExpenses.slice(0, 3).map((expense) => (
              <div key={expense.id} className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-card px-3 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/70">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{expense.description}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatKes(expense.amount)} · {formatDate(expense.date)}</p>
                </div>
                <Link href={`/expenses?edit=${expense.id}&month=${month}&year=${year}`}>
                  <Button size="sm" className="w-full shrink-0 sm:w-auto" data-testid={`categorize-expense-${expense.id}`}>
                    Categorize now
                  </Button>
                </Link>
              </div>
            ))}
          </div>
          {editableUncategorizedExpenses.length > 3 && (
            <Link href="/expenses" className="mt-3 inline-flex text-sm font-semibold text-amber-900 underline-offset-4 hover:underline dark:text-amber-100">
              Review all {editableUncategorizedExpenses.length} uncategorized expenses
            </Link>
          )}
        </section>
      )}

       {/* ── Quick Actions ── */}
        <Card id="dashboard-quick-actions" className="scroll-mt-6 overflow-hidden border-none shadow-md">
        <CardContent className="p-0">
          {/* Action buttons row */}
          <div className="grid grid-cols-2 divide-x divide-y divide-border/50 sm:grid-cols-6 sm:divide-y-0">
            {[
               { key: "income" as const, label: "Bank Deposit", shortLabel: "Deposit",  icon: Building2, active: "bg-success/10", text: "text-success" },
               { key: "expense" as const, label: "Log Expense",  shortLabel: "Expense",  icon: Receipt, active: "bg-warning/10", text: "text-warning" },
               { key: "goal" as const,   label: "Save to Goal", shortLabel: "Save",     icon: Target, active: "bg-info/10", text: "text-info" },
             ].map(({ key, label, shortLabel, icon: ActionIcon, active, text }) => (
              <button
                key={key}
                onClick={() => toggle(key)}
                disabled={sharedTransactionsLocked && (key === "expense" || key === "goal")}
                className={`flex min-w-0 flex-col items-center justify-center gap-1.5 px-1 py-5 text-center text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 sm:px-3 sm:text-sm ${activeAction === key ? `${active} ${text}` : "hover:bg-muted/40 text-foreground"}`}
              >
                <ActionIcon className="h-5 w-5" aria-hidden="true" />
                <span className="block sm:hidden">{shortLabel}</span>
                <span className="hidden sm:block max-w-full break-words">{label}</span>
                {activeAction === key && <X className="w-3.5 h-3.5 mt-0.5 opacity-60" />}
              </button>
            ))}
            <Link
              href="/bank?shortcut=withdraw"
              data-testid="dashboard-withdraw-cta"
              aria-disabled={!canManageBank}
              onClick={(event) => {
                if (!canManageBank) event.preventDefault();
              }}
              className={`flex min-w-0 flex-col items-center justify-center gap-1.5 px-1 py-5 text-center text-xs font-medium transition-colors sm:px-3 sm:text-sm ${canManageBank ? "text-foreground hover:bg-muted/40" : "cursor-not-allowed text-foreground opacity-45"}`}
            >
              <TrendingDown className="h-5 w-5" aria-hidden="true" />
              <span className="block sm:hidden">Withdraw</span>
              <span className="hidden max-w-full break-words sm:block">Bank Withdrawal</span>
            </Link>
            <Link
              href="/bank?shortcut=bank-transfer"
              data-testid="dashboard-bank-transfer-cta"
              aria-disabled={!canManageBank}
              onClick={(event) => { if (!canManageBank) event.preventDefault(); }}
              className={`flex min-w-0 flex-col items-center justify-center gap-1.5 px-1 py-5 text-center text-xs font-medium transition-colors sm:px-3 sm:text-sm ${canManageBank ? "text-foreground hover:bg-muted/40" : "cursor-not-allowed text-foreground opacity-45"}`}
            >
              <ArrowRightLeft className="h-5 w-5" aria-hidden="true" />
              <span className="block sm:hidden">Transfer</span>
              <span className="hidden max-w-full break-words sm:block">Bank Transfer</span>
            </Link>
            <Link
              href="/budget"
              data-testid="dashboard-create-budget-cta"
              className="flex min-w-0 flex-col items-center justify-center gap-1.5 px-1 py-5 text-center text-xs font-medium text-foreground transition-colors hover:bg-muted/40 sm:px-3 sm:text-sm"
            >
               <Wallet className="h-5 w-5" aria-hidden="true" />
              <span className="block sm:hidden">Budget</span>
              <span className="hidden max-w-full break-words sm:block">
                {(summary?.totalBudget ?? 0) > 0 ? "Manage Budget" : "Create Budget"}
              </span>
            </Link>
          </div>
          {sharedTransactionsLocked && (
            <p className="mx-4 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
              Invite one more member to this group before recording shared expenses or contributions. Bank activity and group setup are still available.
            </p>
          )}

          {/* Expanded form */}
          {activeAction !== "none" && (
            <div className="border-t border-border/50 p-6 bg-muted/20">
              {activeAction === "income"  && <IncomeForm onDone={() => setActiveAction("none")} currentUserId={user?.id} canManageShared={canManageShared} isSharedWorkspace={isSharedWorkspace} />}
              {activeAction === "expense" && <ExpenseForm onDone={() => setActiveAction("none")} currentUserId={user?.id} canManageShared={canManageShared} canManageCategories={canManageCategories} canUseBankFunding={canManageBank} isSharedWorkspace={isSharedWorkspace} />}
              {activeAction === "goal"    && <GoalForm goals={goals} onDone={() => setActiveAction("none")} memberUserId={canManageShared ? undefined : user?.id} />}
            </div>
          )}
        </CardContent>
      </Card>

       {/* Personal budget keeps recent activity immediately after quick actions. */}
       {!isSharedWorkspace && <Card className="overflow-hidden border border-border/70 shadow-sm">
         <CardContent className="p-4 sm:p-6">
           <div className="mb-3 flex items-center justify-between">
             <div>
               <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Updates</p>
               <p className="mt-1 text-base font-bold text-foreground">Recent activity</p>
             </div>
             <Link href="/activity" className="text-xs font-semibold text-primary hover:underline">View all</Link>
           </div>
           {activity.length > 0 ? (
             <div className="divide-y divide-border/50">
                {activity.slice(0, 6).map((item) => (
                  <DashboardActivityRow key={item.id} item={item} bankLabel="Bank account" />
                ))}
             </div>
           ) : (
             <p className="py-4 text-center text-sm text-muted-foreground">No activity yet.</p>
           )}
         </CardContent>
       </Card>}

      {isSharedWorkspace && overBudgetCategories.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/20">
            <span className="text-sm font-bold text-destructive">!</span>
          </div>
          <div>
            <p className="font-semibold text-destructive">
              Over budget in {overBudgetCategories.length} {overBudgetCategories.length === 1 ? "category" : "categories"}
            </p>
            <p className="mt-0.5 text-sm text-destructive/80">
              {overBudgetCategories.map((category) => `${category.category} (+${formatKes(Math.abs(category.remaining))})`).join(" · ")}
            </p>
          </div>
        </div>
      )}

      {/* Hero Card */}
      <Card className="bg-primary text-primary-foreground border-none shadow-lg overflow-hidden relative">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
          <CardContent className="p-5 sm:p-8 md:p-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-4 relative z-10">
            <Link
              href="/budget"
              className="group rounded-xl p-2 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              data-testid="dashboard-summary-budget"
            >
              <p className="text-primary-foreground/80 font-medium">Total Budget</p>
              <p className="mt-2 text-lg font-medium text-primary-foreground/70 tracking-wide">{formatKes(summary.totalBudget)}</p>
              <p className="mt-1 text-xs font-semibold text-primary-foreground/70 group-hover:text-primary-foreground">Open budget →</p>
            </Link>
            <Link
              href={`/expenses?month=${month}&year=${year}#expense-ledger`}
              className="group rounded-xl p-2 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              data-testid="dashboard-summary-spent"
            >
              <p className="text-primary-foreground/80 font-medium">Total Spent</p>
              <p className="mt-2 text-lg font-medium text-primary-foreground/70 tracking-wide">{formatKes(summary.totalSpent)}</p>
              <p className="mt-1 text-xs font-semibold text-primary-foreground/70 group-hover:text-primary-foreground">Open expense ledger →</p>
            </Link>
            <Link
              href="/budget"
              className="group rounded-xl p-2 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 md:text-right"
              data-testid="dashboard-summary-remaining"
            >
              <p className="text-primary-foreground/80 font-medium">Remaining</p>
              <p className={`mt-2 text-lg font-medium tracking-wide ${isOverBudget ? "text-destructive-foreground bg-destructive inline-block px-3 rounded-lg" : "text-primary-foreground/70"}`}>
                {formatKes(summary.remaining)}
              </p>
              <p className="mt-1 text-xs font-semibold text-primary-foreground/70 group-hover:text-primary-foreground">Review budget →</p>
            </Link>
          </div>
          <div className="mt-8">
            <div className="flex justify-between text-sm mb-2 text-primary-foreground/80 font-medium">
              <span>{Math.round(percentSpent)}% spent</span>
              <span>{isOverBudget ? "Over Budget" : "On Track"}</span>
            </div>
            <div className="h-3 w-full bg-black/20 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-1000 ${isOverBudget ? "bg-destructive" : "bg-secondary"}`} style={{ width: `${Math.min(percentSpent, 100)}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {isSharedWorkspace && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <Card className="overflow-hidden border-none shadow-md">
            <CardHeader className="border-b border-border/50 bg-muted/30 pb-4">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-secondary" />
                <CardTitle className="text-xl">Group Contributions</CardTitle>
              </div>
              <CardDescription>Target vs contributed for this month</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 p-6">
              {((summary as any).memberContributions ?? [] as Array<{userId: string; name: string; contributed: number; target: number | null}>).map(
                ({ userId, name, contributed, target }: {userId: string; name: string; contributed: number; target: number | null}, index: number) => (
                  <Link
                    key={userId}
                    href={`/contributions?month=${month}&year=${year}#contribution-ledger`}
                    className="block space-y-3 rounded-xl p-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid={`dashboard-contribution-summary-${userId}`}
                  >
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-lg font-semibold text-foreground">{name}</p>
                        {target != null && <p className="text-sm text-muted-foreground">Target: {formatKes(target)}</p>}
                      </div>
                      <p className="font-display text-xl font-bold text-primary">{formatKes(contributed)}</p>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary/20">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ${index === 0 ? "bg-primary" : "bg-secondary"}`}
                        style={{ width: `${Math.min(target && target > 0 ? (contributed / target) * 100 : 0, 100)}%` }}
                      />
                    </div>
                    <p className="text-right text-xs font-semibold text-primary">Open contribution ledger →</p>
                  </Link>
                ),
              )}
              <Link href={`/contributions?month=${month}&year=${year}#contribution-ledger`} className="block pt-2 text-sm font-medium text-primary hover:underline">
                View contribution history →
              </Link>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-none shadow-md">
            <CardHeader className="border-b border-border/50 bg-muted/30 pb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-secondary" />
                <CardTitle className="text-xl">Top Spending</CardTitle>
              </div>
              <CardDescription>Where the group money is going</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              {isBreakdownLoading ? (
                <div className="h-[220px] animate-pulse rounded-xl bg-muted/30" />
              ) : chartData.length > 0 ? (
                <>
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value" stroke="none">
                          {chartData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatKes(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                    {chartData.map((entry) => (
                      <Link
                        key={entry.name}
                        href={`/expenses?month=${month}&year=${year}&category=${encodeURIComponent(entry.name)}#expense-ledger`}
                        className="flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        data-testid={`dashboard-spending-category-${entry.name}`}
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="text-xs text-muted-foreground">{entry.name}</span>
                      </Link>
                    ))}
                  </div>
                  <Link
                    href={`/expenses?month=${month}&year=${year}#expense-ledger`}
                    className="mt-4 block text-sm font-semibold text-primary hover:underline"
                    data-testid="dashboard-open-expense-ledger"
                  >
                    Open expense ledger →
                  </Link>
                </>
              ) : (
                <div className="flex h-[220px] items-center justify-center">
                  <p className="text-center text-muted-foreground">No group expenses recorded this month yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bank Account Balance Card */}
      <Link href="/bank">
        <Card className="border-none shadow-md overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Bank accounts</p>
                  <p className="text-xs text-muted-foreground">{isSharedWorkspace ? "Shared budget funds" : "Personal budget funds"}</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
            <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-3 sm:gap-4">
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Balance</p>
                <p className="text-lg sm:text-2xl font-display font-bold text-sky-600 dark:text-sky-400 break-all">
                  {bankAccount ? formatKes(bankAccount.balance) : "—"}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Deposited</p>
                <p className="break-all text-sm font-semibold text-success sm:text-lg">
                  +{formatKes(monthlyDeposited)}
                </p>
                <p className="text-xs text-muted-foreground">this month</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Disbursed</p>
                <p className="text-sm sm:text-lg font-semibold text-rose-600 dark:text-rose-400 break-all">
                  -{formatKes(monthlyDisbursed)}
                </p>
                <p className="text-xs text-muted-foreground">this month</p>
              </div>
            </div>
             {bankAccount && bankAccount.balance < 0 && (
               <div
                 role="alert"
                 data-testid="overview-negative-bank-balance-warning"
                 className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
               >
                 <p className="flex items-center gap-2 font-semibold">
                   <Flag className="h-4 w-4 fill-current" />
                   Bank balance is below zero
                 </p>
                 <p className="mt-1">
                   The selected budget is short by {formatKes(Math.abs(bankAccount.balance))}. Jamvi keeps the withdrawal recorded so the shortfall stays visible until money is deposited.
                 </p>
               </div>
             )}
          </CardContent>
        </Card>
      </Link>

      {/* Savings Goals */}
      {nearestGoal && (
        <Card className="border-none shadow-md overflow-hidden">
          <CardHeader className="flex flex-col gap-3 border-b border-border/50 bg-muted/30 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2"><Target className="w-5 h-5 text-secondary" /><CardTitle className="text-xl">{isSharedWorkspace ? "Group Goals" : "My Goals"}</CardTitle></div>
              <CardDescription>{activeGoals.length} active goal{activeGoals.length !== 1 ? "s" : ""}</CardDescription>
            </div>
            <Link href="/savings-goals" className="text-sm font-medium text-primary hover:underline">View all →</Link>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-1">
                <p className="font-semibold text-foreground">{nearestGoal.name}</p>
                {nearestGoal.deadline && (
                  <p className="text-xs text-muted-foreground">by {new Date(nearestGoal.deadline).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</p>
                )}
              </div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-bold text-foreground">{formatKes(nearestGoal.currentAmount)}</span>
                <span className="text-muted-foreground">of {formatKes(nearestGoal.targetAmount)}</span>
              </div>
              <div className="h-3 w-full bg-secondary/20 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${Math.min((nearestGoal.currentAmount / nearestGoal.targetAmount) * 100, 100)}%` }} />
              </div>
              <p className="text-xs text-muted-foreground text-right">{Math.round((nearestGoal.currentAmount / nearestGoal.targetAmount) * 100)}% reached</p>
            </div>
            {activeGoals.length > 1 && <p className="text-xs text-muted-foreground mt-4">+{activeGoals.length - 1} more goal{activeGoals.length - 1 !== 1 ? "s" : ""} in progress</p>}
          </CardContent>
        </Card>
      )}

      {isSharedWorkspace && (
        <>
          <Card className="overflow-hidden border-none shadow-md">
            <CardHeader className="border-b border-border/50 bg-muted/30 pb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-secondary" />
                <CardTitle className="text-xl">6-Month Trend</CardTitle>
              </div>
              <CardDescription>Monthly total group spending</CardDescription>
            </CardHeader>
            <CardContent className="h-[280px] p-6">
              {isTrendsLoading ? (
                <div className="h-full animate-pulse rounded-xl bg-muted/30" />
              ) : trends && trends.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trends} margin={{ top: 5, right: 30, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip formatter={(value: number) => [formatKes(value), "Spent"]} />
                    <Bar dataKey="totalSpent" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} maxBarSize={56} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">No trend data yet.</div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-none shadow-md">
            <CardContent className="p-4 sm:p-6">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-base font-bold text-foreground">Recent Activity</p>
                <Link href="/activity" className="text-xs font-medium text-primary hover:underline">View all</Link>
              </div>
              {activity.length > 0 ? (
                <div className="space-y-1">
                  {activity.slice(0, 6).map((item) => (
                    <DashboardActivityRow
                      key={item.id}
                      item={item}
                      compact
                      bankLabel="Bank account"
                      onRemove={
                        canManageExpenses
                        && item.type === ACTIVITY_TYPE.EXPENSE
                        && getActivityRecordTarget(item)?.target === "expense"
                          ? () => {
                              const target = getActivityRecordTarget(item);
                              if (target?.target === "expense") {
                                setDeleteTarget({ id: target.id, description: item.description });
                              }
                            }
                          : undefined
                      }
                    />
                  ))}
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">No recent activity.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {group?.isPrivate && <SharedGroupsFooter />}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteExpense.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Remove this expense from "${budgetName}"?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `"${deleteTarget.description}" and its effect on balances, reports, and activity in "${budgetName}" will be removed. This cannot be undone.`
                : `This expense will be removed from "${budgetName}".`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteExpense.isPending}>Keep expense</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteExpense.isPending}
              onClick={(event) => {
                event.preventDefault();
                void removeDashboardExpense();
              }}
            >
              {deleteExpense.isPending ? "Removing…" : "Remove expense"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
