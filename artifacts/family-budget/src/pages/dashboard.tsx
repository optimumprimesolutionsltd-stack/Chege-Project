import { useEffect, useState } from "react";
import {
  useGetDashboardSummary,
  useGetDashboardActivity,
  useGetDashboardCategoryBreakdown,
  useGetDashboardTrends,
  useGetSavingsGoals,
  useGetBudgetCategories,
  useGetMembers,
  useCreateExpense,
  useCreateDeposit,
  useContributeToSavingsGoal,
  useCascadeContribute,
  useGetJointAccount,
  useGetGroup,
   useGetIncomeSources,
   useGetWorkspaces,
   useSelectWorkspace,
  useCreateSharedGroup,
  getGetDashboardSummaryQueryKey,
  getGetDashboardActivityQueryKey,
  getGetSavingsGoalsQueryKey,
  getGetJointAccountQueryKey,
  getGetExpensesQueryKey,
   getGetIncomeSourcesQueryKey,
  type SavingsGoal,
  type IncomeSource,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatKes, formatDate } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import {
   ArrowUpRight, ArrowDownRight, Wallet, Activity as ActivityIcon,
   Plus, TrendingUp, Target, Loader2, X, ChevronRight, Building2, CheckCircle2, Sparkles, Link2, BriefcaseBusiness, UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ACTIVITY_TYPE } from "@/lib/activityTypes";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@workspace/replit-auth-web";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WorkspaceSwitcher, workspaceLabel } from "@/components/workspace-switcher";

type QuickAction = "none" | "income" | "expense" | "goal";

function OpenInvitationLinkButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);

  const openInvitation = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const invitationUrl = new URL(link.trim(), window.location.origin);
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const appPath = base && invitationUrl.pathname.startsWith(`${base}/`)
        ? invitationUrl.pathname.slice(base.length)
        : invitationUrl.pathname;
      if (
        invitationUrl.origin !== window.location.origin ||
        !/^\/(?:invite|join)\/[^/]+\/?$/.test(appPath)
      ) {
        throw new Error("Paste a Bajeti email invitation or private group link.");
      }
      window.location.assign(`${invitationUrl.pathname}${invitationUrl.search}${invitationUrl.hash}`);
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Could not open that invitation.");
    }
  };

  return (
    <>
      <Button type="button" variant="outline" className="h-11 shrink-0 rounded-xl px-5" onClick={() => setIsOpen(true)}>
        <Link2 className="mr-2 h-4 w-4" />
        I have an invitation link
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Join a private group</DialogTitle>
          </DialogHeader>
          <form onSubmit={openInvitation} className="space-y-5">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Paste the email invitation or private group link you received. It will add that group alongside My Budget after you accept.
            </p>
            <div className="space-y-2">
              <label htmlFor="group-invitation-link" className="text-sm font-semibold text-foreground">Invitation link</label>
              <Input
                id="group-invitation-link"
                autoFocus
                placeholder="https://…/invite/…"
                value={link}
                onChange={(event) => setLink(event.target.value)}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full">
              Open invitation
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreateSharedGroupCard() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const createSharedGroup = useCreateSharedGroup();
  const { toast } = useToast();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) {
      toast({
        variant: "destructive",
        title: "Group name required",
        description: "Enter at least two characters before creating a private group.",
      });
      return;
    }
    try {
      await createSharedGroup.mutateAsync({ data: { name: name.trim() } });
      window.location.assign("/");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not create group",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  return (
    <>
      <Card className="overflow-hidden border border-primary/20 bg-gradient-to-br from-primary/[0.08] to-card shadow-sm">
        <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">My Budget is private</p>
            <h2 className="mt-1 font-display text-xl font-bold text-foreground">Need to budget with other people?</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Create a private group for your family, chama, club, team, or any shared goal. It starts empty, stays separate from My Budget, and only people you invite can join.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <OpenInvitationLinkButton />
            <Button className="h-11 rounded-xl px-5" onClick={() => setIsOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create a private group
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create a private group</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-5">
            <p className="text-sm leading-relaxed text-muted-foreground">
              You will be the owner. Your My Budget records will stay private and will not be copied into this group.
            </p>
            <div className="space-y-2">
              <label htmlFor="shared-group-name" className="text-sm font-semibold text-foreground">Group name</label>
              <Input
                id="shared-group-name"
                autoFocus
                maxLength={60}
                placeholder="e.g. Mwangaza Chama"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={createSharedGroup.isPending}>
              {createSharedGroup.isPending ? "Creating…" : "Create private group"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SharedGroupsFooter() {
  const { data: workspaces = [], isLoading } = useGetWorkspaces();
  const selectWorkspace = useSelectWorkspace();
  const { toast } = useToast();
  const sharedWorkspaces = workspaces.filter((workspace) => !workspace.isPrivate);

  if (isLoading) return null;

  const openGroupOverview = async (groupId: number) => {
    try {
      await selectWorkspace.mutateAsync({ data: { groupId } });
      window.location.assign("/");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not open group overview",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  if (sharedWorkspaces.length === 0) {
    return <CreateSharedGroupCard />;
  }

  return (
    <Card className="border border-primary/15 bg-card shadow-sm">
      <CardContent className="flex flex-col gap-5 p-5 sm:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Shared groups</p>
          <h2 className="mt-1 font-display text-xl font-bold text-foreground">Group overview</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Keep My Budget focused on your personal finances. Open a shared group below when you want to see its pooled budget, members, goals, and activity.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {sharedWorkspaces.map((workspace) => (
            <Button
              key={workspace.id}
              variant="outline"
              className="h-12 justify-between rounded-xl px-4 text-left"
              onClick={() => void openGroupOverview(workspace.id)}
              disabled={selectWorkspace.isPending}
            >
              <span className="min-w-0 truncate">{workspace.name}</span>
              <ArrowUpRight className="ml-3 h-4 w-4 shrink-0 text-primary" />
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/settings" className="text-sm font-medium text-primary hover:underline">
            Manage shared groups →
          </Link>
          <OpenInvitationLinkButton />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Quick Action: Bank Deposit ────────────────────────────────────────────────
function IncomeForm({
  onDone,
  currentUserId,
  canManageShared,
}: {
  onDone: () => void;
  currentUserId?: string;
  canManageShared: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [madeById, setMadeById] = useState<string>("");
  const [incomeSourceId, setIncomeSourceId] = useState<number | null>(null);
  const { data: members = [] } = useGetMembers();
  const selectableMembers = canManageShared
    ? members
    : members.filter((member) => member.userId === currentUserId);
  const createDeposit = useCreateDeposit();
  const qc = useQueryClient();
  const { toast } = useToast();
  const now = new Date();

  const { data: incomeSources } = useQuery<IncomeSource[]>({
    queryKey: ["income-sources", madeById],
    queryFn: async () => {
      const res = await fetch(`/api/income-sources?userId=${madeById}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!madeById,
    staleTime: 60_000,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast({
        variant: "destructive",
        title: "Enter a valid amount",
        description: "Add a deposit amount greater than zero before recording it.",
      });
      return;
    }
    if (!Number.isInteger(amt)) {
      toast({
        variant: "destructive",
        title: "Enter a whole KES amount",
        description: "Deposits are recorded in whole shillings.",
      });
      return;
    }
    try {
      await createDeposit.mutateAsync({
        data: {
          amount: amt,
          description: description.trim() || "Deposit",
          date: now.toISOString().split("T")[0],
          madeById: canManageShared ? madeById : currentUserId,
          ...(incomeSourceId ? { incomeSourceId } : {}),
        } as Parameters<typeof createDeposit.mutateAsync>[0]["data"],
      });
      qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      qc.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
      qc.invalidateQueries({ queryKey: getGetJointAccountQueryKey() });
       const who = members.find(m => m.userId === (canManageShared ? madeById : currentUserId))?.userName?.split(" ")[0] ?? "Member";
      toast({ title: "Deposit recorded", description: `${who} · ${formatKes(amt)} added to this month.` });
      onDone();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not record deposit." });
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {/* Person picker */}
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-foreground">Who is depositing?</label>
        <div className="grid grid-cols-2 gap-2">
          {selectableMembers.map((m) => {
            const name = m.userName?.split(" ")[0] ?? "Member";
            return (
              <button key={m.userId} type="button" onClick={() => { setMadeById(m.userId); setIncomeSourceId(null); }}
                className={`py-3 rounded-xl border text-sm font-semibold transition-colors ${madeById === m.userId ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground hover:bg-muted/40"}`}>
                {name}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">Amount (KES)</label>
          <Input type="number" placeholder="e.g. 50000" value={amount} onChange={e => setAmount(e.target.value)} min="1" required className="h-12 bg-card text-base" autoFocus />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
          <Input placeholder="e.g. Salary, rental income…" value={description} onChange={e => setDescription(e.target.value)} className="h-12 bg-card" />
        </div>
      </div>
      {/* Income source */}
      {incomeSources && incomeSources.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">Income source <span className="text-muted-foreground font-normal">(optional)</span></label>
          <div className="flex flex-wrap gap-2">
            {incomeSources.map(src => (
              <button key={src.id} type="button"
                onClick={() => setIncomeSourceId(incomeSourceId === src.id ? null : src.id)}
                className={`px-3 h-9 rounded-lg text-sm border transition-colors ${incomeSourceId === src.id ? "bg-primary text-primary-foreground border-primary font-semibold" : "bg-card border-input text-foreground hover:bg-muted/50"}`}>
                {src.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-3">
        <Button type="submit" className="h-12 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex-1 text-base" disabled={createDeposit.isPending}>
          {createDeposit.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Record Deposit
        </Button>
        <Button type="button" variant="ghost" className="h-12" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

// ── Quick Action: Log Expense ────────────────────────────────────────────────
function ExpenseForm({
  onDone,
  currentUserId,
  canManageShared,
}: {
  onDone: () => void;
  currentUserId?: string;
  canManageShared: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const { data: categories = [] } = useGetBudgetCategories();
  const { data: members = [] } = useGetMembers();
  const selectableMembers = canManageShared
    ? members
    : members.filter((member) => member.userId === currentUserId);
  const createExpense = useCreateExpense();
  const qc = useQueryClient();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast({
        variant: "destructive",
        title: "Enter a valid amount",
        description: "Add an expense amount greater than zero before logging it.",
      });
      return;
    }
    if (!Number.isInteger(amt)) {
      toast({
        variant: "destructive",
        title: "Enter a whole KES amount",
        description: "Expenses are recorded in whole shillings.",
      });
      return;
    }
    if (!description.trim()) {
      toast({
        variant: "destructive",
        title: "Description required",
        description: "Explain what the expense was for before logging it.",
      });
      return;
    }
    if (!paidBy) {
      toast({
        variant: "destructive",
        title: "Choose who paid",
        description: "Select the person who paid before logging this expense.",
      });
      return;
    }
    try {
      await createExpense.mutateAsync({
        data: {
          amount: amt,
          description,
          category: category,
          paidById: canManageShared ? paidBy : currentUserId,
          date: new Date().toISOString().split('T')[0],
        },
      });
      qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      qc.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
      qc.invalidateQueries({ queryKey: getGetExpensesQueryKey() });
      toast({ title: "Expense logged", description: `${formatKes(amt)} — ${description}` });
      onDone();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not log expense." });
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">Amount (KES)</label>
          <Input type="number" placeholder="e.g. 2500" value={amount} onChange={e => setAmount(e.target.value)} min="1" required className="h-11 bg-card text-base" autoFocus />
        </div>
        <div className="space-y-1.5 lg:col-span-1">
          <label className="text-sm font-semibold text-foreground">Description</label>
          <Input placeholder="What was it for?" value={description} onChange={e => setDescription(e.target.value)} required className="h-11 bg-card" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">Category <span className="text-muted-foreground font-normal">(optional)</span></label>
          <select value={category} onChange={e => setCategory(e.target.value)} className="w-full h-11 rounded-lg border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">Pick a category</option>
            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">
            Paid by <span className="text-destructive">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
             {selectableMembers.map((m) => {
              const name = m.userName?.split(" ")[0] ?? "Member";
              return (
                <button key={m.userId} type="button" onClick={() => setPaidBy(m.userId)}
                  className={`h-11 rounded-lg border text-sm font-semibold transition-colors ${paidBy === m.userId ? "bg-primary text-primary-foreground border-primary" : "bg-card border-input text-foreground hover:bg-muted/40"}`}>
                  {name}
                </button>
              );
            })}
          </div>
          {!paidBy && <p className="text-xs text-muted-foreground">Choose who paid before saving.</p>}
        </div>
      </div>
      <div className="flex gap-3">
        <Button type="submit" className="h-11 px-6 rounded-xl bg-amber-600 hover:bg-amber-700 text-white" disabled={createExpense.isPending}>
          {createExpense.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Log Expense
        </Button>
        <Button type="button" variant="ghost" className="h-11" onClick={onDone}>Cancel</Button>
      </div>
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
            {a.completed && <span className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full font-semibold">Complete! 🎉</span>}
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
        <Button type="submit" className="h-11 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white" disabled={isPending}>
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
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const [activeAction, setActiveAction] = useState<QuickAction>("none");
  const { user } = useAuth();

  const { data: summary, isLoading: isSummaryLoading, isError: isSummaryError } = useGetDashboardSummary({ month, year });
  const { data: activity, isLoading: isActivityLoading } = useGetDashboardActivity();
  const { data: breakdown, isLoading: isBreakdownLoading } = useGetDashboardCategoryBreakdown({ month, year });
  const { data: trends, isLoading: isTrendsLoading } = useGetDashboardTrends({ months: 6 });
  const { data: goals } = useGetSavingsGoals();
  const { data: bankAccount } = useGetJointAccount();
  const { data: group } = useGetGroup();
  const { data: members = [] } = useGetMembers();
  const { data: incomeSources = [], isLoading: isIncomeSourcesLoading } = useGetIncomeSources(
    { userId: user?.id },
    {
      query: {
        enabled: Boolean(user?.id),
        queryKey: getGetIncomeSourcesQueryKey({ userId: user?.id }),
      },
    },
  );
  const isSharedWorkspace = group?.isPrivate === false;
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
  const [isSetupPathOpen, setIsSetupPathOpen] = useState(false);
  const [isSetupDeferred, setIsSetupDeferred] = useState(false);
  const [showSetupNudge, setShowSetupNudge] = useState(false);

  const setupSteps = [
    {
      id: "budget",
      label: "Set your monthly budget",
      description: "Give this month’s spending a clear plan.",
      href: "/budget",
      icon: Wallet,
      done: (summary?.totalBudget ?? 0) > 0,
    },
    {
      id: "income",
      label: "Add an income source",
      description: "Name where the money you budget comes from.",
      href: "/settings",
      icon: BriefcaseBusiness,
      done: incomeSources.length > 0,
    },
    {
      id: "bank",
      label: isSharedWorkspace ? "Fund the shared bank" : "Record bank funding",
      description: "Record the first deposit so your available funds are clear.",
      href: "/bank",
      icon: Building2,
      done: (bankAccount?.transactions?.length ?? 0) > 0,
    },
    {
      id: "goal",
      label: "Create a savings goal",
      description: "Start putting money aside for something important.",
      href: "/savings-goals",
      icon: Target,
      done: (goals?.length ?? 0) > 0,
    },
    ...(isSharedWorkspace ? [{
      id: "invite",
      label: "Invite your group",
      description: "Bring in the people who will manage this budget with you.",
      href: "/settings",
      icon: UsersRound,
      done: members.length > 1,
    }] : []),
  ];
  const completeSetupSteps = setupSteps.filter(step => step.done).length;
  const pendingSetupSteps = setupSteps.filter(step => !step.done);
  const nextSetupStep = pendingSetupSteps[0];
  const isSetupComplete = completeSetupSteps === setupSteps.length;
  const setupNudgeKey = group?.id && user?.id
    ? `bajeti:onboarding-nudge:${group.id}:${user.id}`
    : null;

  useEffect(() => {
    if (
      !canManageSetup ||
      isSetupDeferred ||
      !setupNudgeKey ||
      !nextSetupStep ||
      isSummaryLoading ||
      isIncomeSourcesLoading
    ) {
      setShowSetupNudge(false);
      return;
    }

    const now = Date.now();
    const lastShown = Number(window.localStorage.getItem(setupNudgeKey) ?? 0);
    const sixHours = 6 * 60 * 60 * 1000;
    if (now - lastShown < sixHours) return;

    const showTimer = window.setTimeout(() => {
      window.localStorage.setItem(setupNudgeKey, String(Date.now()));
      setShowSetupNudge(true);
    }, 1200);
    const hideTimer = window.setTimeout(() => setShowSetupNudge(false), 13_200);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [
    canManageSetup,
    isSetupDeferred,
    isIncomeSourcesLoading,
    isSummaryLoading,
    nextSetupStep?.id,
    setupNudgeKey,
  ]);

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

  if (isSummaryLoading || isActivityLoading || isBreakdownLoading) {
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
              Bajeti keeps each group’s shared funds, budgets, and savings goals private. Ask someone already in this group to add you from Settings.
            </p>
            <Link href="/settings">
              <Button className="mt-6 rounded-xl">Open Settings</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!summary || !activity || !breakdown) return null;

  const percentSpent = summary.totalBudget > 0 ? (summary.totalSpent / summary.totalBudget) * 100 : 0;
  const isOverBudget = percentSpent > 100;
  const overBudgetCategories = breakdown.filter(b => b.percentUsed > 100);

  const chartData = breakdown
    .filter(b => b.spentAmount > 0)
    .sort((a, b) => b.spentAmount - a.spentAmount)
    .slice(0, 5)
    .map(b => ({ name: b.category, value: b.spentAmount, color: b.color || "hsl(var(--primary))" }));
  if (breakdown.filter(b => b.spentAmount > 0).length > 5) {
    chartData.push({ name: "Others", value: breakdown.filter(b => b.spentAmount > 0).sort((a,b) => b.spentAmount - a.spentAmount).slice(5).reduce((s,b) => s + b.spentAmount, 0), color: "hsl(var(--muted-foreground))" });
  }
  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">
            {isSharedWorkspace ? "Shared budget" : "Personal budget"}
          </p>
          <h1 className="mt-1 text-3xl font-display font-bold text-foreground">
            {group?.isPrivate ? "My Budget" : "Group Overview"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(now)}
          </p>
        </div>

        <section
          aria-labelledby="dashboard-workspace-heading"
          className="w-full rounded-2xl border border-primary/15 bg-card p-4 shadow-sm sm:max-w-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p id="dashboard-workspace-heading" className="text-xs font-bold uppercase tracking-[0.15em] text-primary">
                Viewing budget
              </p>
              <p className="mt-1 truncate font-display text-lg font-bold text-foreground">
                {group ? workspaceLabel(group) : "My Budget"}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {isSharedWorkspace ? "Shared" : "Personal"}
            </span>
          </div>
          <label htmlFor="dashboard-workspace-switcher" className="sr-only">
            Choose a budget workspace
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

       {canManageSetup && nextSetupStep && isSetupDeferred && (
         <Card className="border border-border/70 bg-muted/35 shadow-sm">
           <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
             <div>
               <p className="text-sm font-bold text-foreground">Setup paused</p>
               <p className="mt-0.5 text-sm text-muted-foreground">
                 Pick up with {nextSetupStep.label.toLowerCase()} whenever you are ready.
               </p>
             </div>
             <Button
               type="button"
               size="sm"
               data-testid="setup-resume-cta"
               className="rounded-lg"
               onClick={() => setIsSetupDeferred(false)}
             >
               Resume setup
             </Button>
           </CardContent>
         </Card>
       )}
       {canManageSetup && nextSetupStep && !isSetupDeferred && (
         <Card
           className={`overflow-hidden shadow-sm ${
             isSetupComplete
               ? "border border-border/60 bg-muted/50 text-muted-foreground"
               : "border border-primary/15 bg-primary/[0.04]"
           }`}
         >
           <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-xl">
                  <p className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.16em] ${
                   isSetupComplete ? "text-muted-foreground" : "text-primary"
                 }`}>
                   {!isSetupComplete && <Sparkles className="h-3.5 w-3.5" />}
                   Start here · Step {Math.min(completeSetupSteps + 1, setupSteps.length)} of {setupSteps.length}
                </p>
                 <h2 className="mt-1 font-display text-xl font-bold text-foreground sm:text-2xl">
                    {isSetupComplete ? "You’re all set" : completeSetupSteps > 0 ? "Almost there" : "Set up Bajeti"}
                 </h2>
                 <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                   {isSetupComplete
                     ? "Your core setup is complete. You can keep using Bajeti as normal."
                      : "One real action at a time. You can come back whenever you are ready."}
                </p>
                 <div className={`mt-4 h-2 w-full max-w-md overflow-hidden rounded-full ${
                   isSetupComplete ? "bg-muted-foreground/20" : "bg-primary/10"
                 }`}>
                  <div
                     className={`h-full rounded-full transition-all duration-500 ${
                       isSetupComplete ? "bg-muted-foreground/60" : "bg-secondary"
                     }`}
                    style={{ width: `${(completeSetupSteps / setupSteps.length) * 100}%` }}
                  />
                </div>
              </div>
               {nextSetupStep ? (
                 <Link
                   href={nextSetupStep.href}
                   data-testid="setup-primary-cta"
                   className="group flex min-h-14 w-full items-center gap-3 rounded-xl border border-primary/15 bg-card px-3.5 py-2.5 text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/[0.03] sm:max-w-sm"
                 >
                   <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary/15 text-xl">
                      {(() => {
                        const NextStepIcon = nextSetupStep.icon;
                        return <NextStepIcon className="h-5 w-5" />;
                      })()}
                   </span>
                   <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-primary/75">Do this next</span>
                     <span className="block truncate font-display text-sm font-bold">{nextSetupStep.label}</span>
                   </span>
                   <ChevronRight className="h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-x-1" />
                 </Link>
               ) : (
                 <button
                   type="button"
                   disabled
                   data-testid="setup-primary-cta"
                   className="flex min-h-16 w-full cursor-not-allowed items-center gap-3 rounded-2xl bg-muted-foreground/15 px-4 py-3 text-muted-foreground shadow-none sm:max-w-sm"
                 >
                   <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted-foreground/15">
                     <CheckCircle2 className="h-5 w-5" />
                   </span>
                   <span className="min-w-0 flex-1 text-left">
                     <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Setup complete</span>
                     <span className="block truncate font-display text-base font-bold">All core steps done</span>
                   </span>
                   <CheckCircle2 className="h-5 w-5 shrink-0" />
                 </button>
               )}
            </div>
              {!isSetupComplete && (
                <div className="mt-4">
                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      data-testid="setup-path-toggle"
                      aria-expanded={isSetupPathOpen}
                      className="h-8 px-2 text-xs text-muted-foreground"
                      onClick={() => setIsSetupPathOpen((isOpen) => !isOpen)}
                    >
                      {isSetupPathOpen ? "Hide setup path" : "See all setup steps"}
                      <ChevronRight className={`ml-1 h-3.5 w-3.5 transition-transform ${isSetupPathOpen ? "rotate-90" : ""}`} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      data-testid="setup-skip-cta"
                      className="h-8 px-2 text-xs text-muted-foreground"
                      onClick={() => setIsSetupDeferred(true)}
                    >
                      Skip for now
                    </Button>
                  </div>
                  {isSetupPathOpen && (
                    <ol className="mt-2 divide-y divide-border/60 rounded-xl border border-border/70 bg-card/70 px-3">
                      {setupSteps.map((step, index) => {
                        const StepIcon = step.done ? CheckCircle2 : step.icon;
                        const isNext = step.id === nextSetupStep?.id;
                        return (
                          <li key={step.id} className="flex items-center gap-3 py-3">
                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${step.done ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary"}`}>
                              <StepIcon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className={`block text-sm font-semibold ${step.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                                {index + 1}. {step.label}
                              </span>
                              <span className="block text-xs leading-relaxed text-muted-foreground">{step.description}</span>
                            </span>
                            {isNext && (
                              <Link href={step.href} data-testid={`setup-step-${step.id}`} className="text-xs font-bold text-primary hover:underline">
                                Start
                              </Link>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
              )}
          </CardContent>
        </Card>
      )}
       {showSetupNudge && nextSetupStep && (
         <aside
           aria-live="polite"
           className="fixed bottom-5 right-5 z-50 w-[calc(100%-2.5rem)] max-w-sm rounded-2xl border border-primary/25 bg-card p-4 shadow-2xl sm:bottom-8 sm:right-8"
         >
           <div className="flex items-start gap-3">
             <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
               <Sparkles className="h-4 w-4" />
             </span>
             <div className="min-w-0 flex-1">
               <p className="text-sm font-bold text-foreground">Almost there</p>
               <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                 Your next small step is {nextSetupStep.label.toLowerCase()}.
               </p>
               <Link
                 href={nextSetupStep.href}
                 data-testid="setup-nudge-cta"
                 onClick={() => setShowSetupNudge(false)}
                 className="mt-3 inline-flex text-sm font-bold text-primary hover:underline"
               >
                 Start now <ChevronRight className="ml-1 h-4 w-4" />
               </Link>
             </div>
             <Button
               type="button"
               variant="ghost"
               size="icon"
               data-testid="setup-nudge-close"
               aria-label="Dismiss setup reminder"
               className="h-7 w-7 shrink-0"
               onClick={() => setShowSetupNudge(false)}
             >
               <X className="h-4 w-4" />
             </Button>
           </div>
         </aside>
       )}

      {/* ── Quick Actions ── */}
      <Card className="border-none shadow-md overflow-hidden">
        <CardContent className="p-0">
          {/* Action buttons row */}
          <div className="grid grid-cols-3 divide-x divide-border/50">
            {[
              { key: "income" as const, label: "Bank Deposit", icon: "💰", active: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-400" },
              { key: "expense" as const, label: "Log Expense",   icon: "📋", active: "bg-amber-50 dark:bg-amber-950/40",   text: "text-amber-700 dark:text-amber-400" },
              { key: "goal" as const,   label: "Save to Goal",  icon: "🎯", active: "bg-blue-50 dark:bg-blue-950/40",     text: "text-blue-700 dark:text-blue-400" },
            ].map(({ key, label, icon, active, text }) => (
              <button
                key={key}
                onClick={() => toggle(key)}
                disabled={sharedTransactionsLocked && (key === "expense" || key === "goal")}
                className={`flex flex-col items-center justify-center gap-1.5 py-5 px-3 transition-colors font-medium text-sm sm:text-base disabled:cursor-not-allowed disabled:opacity-45 ${activeAction === key ? `${active} ${text}` : "hover:bg-muted/40 text-foreground"}`}
              >
                <span className="text-2xl">{icon}</span>
                <span>{label}</span>
                {activeAction === key && <X className="w-3.5 h-3.5 mt-0.5 opacity-60" />}
              </button>
            ))}
          </div>
          {sharedTransactionsLocked && (
            <p className="mx-4 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
              Invite one more member to this group before recording shared expenses or contributions. Bank activity and group setup are still available.
            </p>
          )}

          {/* Expanded form */}
          {activeAction !== "none" && (
            <div className="border-t border-border/50 p-6 bg-muted/20">
              {activeAction === "income"  && <IncomeForm onDone={() => setActiveAction("none")} currentUserId={user?.id} canManageShared={canManageSetup} />}
              {activeAction === "expense" && <ExpenseForm onDone={() => setActiveAction("none")} currentUserId={user?.id} canManageShared={canManageSetup} />}
              {activeAction === "goal"    && <GoalForm goals={goals} onDone={() => setActiveAction("none")} memberUserId={canManageSetup ? undefined : user?.id} />}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Over-budget alert */}
      {overBudgetCategories.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-destructive font-bold text-sm">!</span>
          </div>
          <div>
            <p className="font-semibold text-destructive">Over budget in {overBudgetCategories.length} {overBudgetCategories.length === 1 ? "category" : "categories"}</p>
            <p className="text-sm text-destructive/80 mt-0.5">
              {overBudgetCategories.map(c => `${c.category} (+${formatKes(Math.abs(c.remaining))})`).join(" · ")}
            </p>
          </div>
        </div>
      )}

      {/* Hero Card */}
      <Card className="bg-primary text-primary-foreground border-none shadow-lg overflow-hidden relative">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
        <CardContent className="p-8 md:p-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-4 relative z-10">
            <div className="space-y-2">
              <p className="text-primary-foreground/80 font-medium">Total Budget</p>
              <p className="text-lg font-medium text-primary-foreground/70 tracking-wide">{formatKes(summary.totalBudget)}</p>
            </div>
            <div className="space-y-2">
              <p className="text-primary-foreground/80 font-medium">Total Spent</p>
              <p className="text-lg font-medium text-primary-foreground/70 tracking-wide">{formatKes(summary.totalSpent)}</p>
            </div>
            <div className="space-y-2 md:text-right">
              <p className="text-primary-foreground/80 font-medium">Remaining</p>
              <p className={`text-lg font-medium tracking-wide ${isOverBudget ? "text-destructive-foreground bg-destructive inline-block px-3 rounded-lg" : "text-primary-foreground/70"}`}>
                {formatKes(summary.remaining)}
              </p>
            </div>
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

      {/* Bank Account Balance Card */}
      <Link href="/bank">
        <Card className="border-none shadow-md overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{isSharedWorkspace ? "Joint Account" : "My Account"}</p>
                  <p className="text-xs text-muted-foreground">{isSharedWorkspace ? "Shared group funds" : "Personal funds"}</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Balance</p>
                <p className="text-lg sm:text-2xl font-display font-bold text-sky-600 dark:text-sky-400 break-all">
                  {bankAccount ? formatKes(bankAccount.balance) : "—"}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Deposited</p>
                <p className="text-sm sm:text-lg font-semibold text-emerald-600 dark:text-emerald-400 break-all">
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
          </CardContent>
        </Card>
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Contributions */}
        <Card className="border-none shadow-md overflow-hidden">
          <CardHeader className="bg-muted/30 border-b border-border/50 pb-4">
            <div className="flex items-center gap-2"><Wallet className="w-5 h-5 text-secondary" /><CardTitle className="text-xl">{isSharedWorkspace ? "Group Contributions" : "My Contributions"}</CardTitle></div>
            <CardDescription>Target vs Contributed for this month</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {((summary as any).memberContributions ?? [] as Array<{name: string; contributed: number; target: number | null}>).map(({ name, contributed, target }: {name: string; contributed: number; target: number | null}, idx: number) => {
              const color = idx === 0 ? "bg-primary" : "bg-secondary";
              return (
                <div key={`${name}-${idx}`} className="space-y-3">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="font-semibold text-foreground text-lg">{name}</p>
                      {target != null && <p className="text-sm text-muted-foreground">Target: {formatKes(target)}</p>}
                    </div>
                    <p className="font-display font-bold text-xl text-primary">{formatKes(contributed)}</p>
                  </div>
                  <div className="h-2.5 w-full bg-secondary/20 rounded-full overflow-hidden">
                    <div className={`h-full ${color} rounded-full transition-all duration-1000`} style={{ width: `${Math.min(target && target > 0 ? (contributed / target) * 100 : 0, 100)}%` }} />
                  </div>
                </div>
              );
            })}
            <Link href="/contributions" className="text-sm font-medium text-primary hover:underline block pt-2">View contribution history →</Link>
          </CardContent>
        </Card>

        {/* Category Breakdown Chart */}
        <Card className="border-none shadow-md overflow-hidden">
          <CardHeader className="bg-muted/30 border-b border-border/50 pb-4">
            <div className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-secondary" /><CardTitle className="text-xl">Top Spending</CardTitle></div>
            <CardDescription>Where the money is going</CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {chartData.length > 0 ? (
              <>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value" stroke="none">
                        {chartData.map((_, i) => <Cell key={i} fill={chartData[i].color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatKes(v)} contentStyle={{ borderRadius: "0.75rem", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-3">
                  {chartData.map((entry, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                      <span className="text-xs text-muted-foreground">{entry.name}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[220px] flex items-center justify-center">
                <p className="text-center text-muted-foreground">No expenses recorded this month yet.</p>
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* Savings Goals */}
      {nearestGoal && (
        <Card className="border-none shadow-md overflow-hidden">
          <CardHeader className="bg-muted/30 border-b border-border/50 pb-4 flex flex-row items-center justify-between">
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

      {/* 6-Month Trend */}
      <Card className="border-none shadow-md overflow-hidden">
        <CardHeader className="bg-muted/30 border-b border-border/50 pb-4">
          <div className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-secondary" /><CardTitle className="text-xl">6-Month Trend</CardTitle></div>
          <CardDescription>Monthly total spending</CardDescription>
        </CardHeader>
        <CardContent className="p-6 h-[280px]">
          {isTrendsLoading ? <div className="h-full bg-muted/30 rounded-xl animate-pulse" /> : trends && trends.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trends} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={40} />
                <Tooltip formatter={(v: number) => [formatKes(v), "Spent"]} contentStyle={{ borderRadius: "0.75rem", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} />
                <Bar dataKey="totalSpent" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} maxBarSize={56} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-full flex items-center justify-center text-muted-foreground">No trend data yet.</div>}
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card className="border-none shadow-md overflow-hidden">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-base font-bold text-foreground">Recent Activity</p>
            <Link href="/activity" className="text-xs font-medium text-primary hover:underline">View all</Link>
          </div>
          {activity.length > 0 ? (
            <div className="space-y-1">
              {activity.slice(0, 6).map((item) => (
                <div key={item.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.type === ACTIVITY_TYPE.EXPENSE ? "bg-muted-foreground/40" : "bg-primary"}`} />
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{item.description}</p>
                      <p className="text-xs text-muted-foreground">{item.userName} · {formatDate(item.date)}</p>
                    </div>
                  </div>
                  <p className={`text-sm font-medium whitespace-nowrap ml-3 ${item.type === ACTIVITY_TYPE.EXPENSE ? "text-foreground/70" : "text-primary"}`}>
                    {item.type === ACTIVITY_TYPE.EXPENSE ? "-" : "+"}{formatKes(item.amount)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No recent activity.</p>
          )}
        </CardContent>
      </Card>

      {group?.isPrivate && <SharedGroupsFooter />}
    </div>
  );
}
