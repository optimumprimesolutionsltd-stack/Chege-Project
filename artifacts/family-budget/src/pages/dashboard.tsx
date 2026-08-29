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
   useCreateBudgetCategory,
  useCreateSharedGroup,
  getGetDashboardSummaryQueryKey,
  getGetDashboardActivityQueryKey,
  getGetDashboardCategoryBreakdownQueryKey,
  getGetDashboardTrendsQueryKey,
  getGetSavingsGoalsQueryKey,
  getGetJointAccountQueryKey,
  getGetExpensesQueryKey,
  getGetBudgetCategoriesQueryKey,
   getGetIncomeSourcesQueryKey,
  type SavingsGoal,
  type IncomeSource,
  type GroupKind,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatKes, formatDate } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import {
   Wallet, Plus, TrendingUp, TrendingDown, Target, Loader2, X, ChevronRight, Building2, Link2, Receipt, BarChart3, Landmark, Home,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ACTIVITY_TYPE } from "@/lib/activityTypes";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@workspace/replit-auth-web";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { workspaceLabel, workspaceNameClass } from "@/lib/workspace-identity";
import { ProfileAvatar } from "@/components/profile-avatar";
import { SHARED_GROUP_KINDS, type SharedGroupKind } from "@/components/group-kind";
import { getActivityEditLink, type ActivityEditItem } from "@/lib/activity-edit-utils";
import { appPath, routePath } from "@/lib/base-path";
import { canManageBankAccount } from "@/lib/bank-access";

type QuickAction = "none" | "income" | "expense" | "goal";

type DashboardActivityItem = ActivityEditItem & {
  type: string;
  amount: number;
  description: string;
  userName?: string | null;
};

function DashboardActivityRow({
  item,
  compact = false,
}: {
  item: DashboardActivityItem;
  compact?: boolean;
}) {
  const editLink = getActivityEditLink(item);
  const rowClass = compact
    ? "flex items-center justify-between border-b border-border/30 py-2 last:border-0"
    : "flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1";
  const content = (
    <>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`${compact ? "h-1.5 w-1.5" : "h-2 w-2"} shrink-0 rounded-full ${item.type === ACTIVITY_TYPE.EXPENSE ? "bg-muted-foreground/40" : "bg-primary"}`} />
        <div className="min-w-0">
          <p className="truncate text-sm text-foreground">{item.description}</p>
          <p className="text-xs text-muted-foreground">
            {item.userName ?? "Joint bank"} · {formatDate(String(item.date))}
            {editLink?.label === "Edit expense" ? " · Edit expense" : ""}
          </p>
        </div>
      </div>
      <div className="ml-3 flex shrink-0 items-center gap-2">
        <p className={`whitespace-nowrap text-sm font-semibold ${item.type === ACTIVITY_TYPE.EXPENSE ? "text-foreground/70" : "text-primary"}`}>
          {item.type === ACTIVITY_TYPE.EXPENSE ? "-" : "+"}{formatKes(item.amount)}
        </p>
        {editLink?.label === "Edit expense" ? <Receipt className="h-4 w-4 text-primary" aria-hidden="true" /> : null}
      </div>
    </>
  );

  return editLink?.label === "Edit expense" ? (
    <Link
      href={editLink.href}
      className={`${rowClass} rounded-md transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      aria-label={`Edit ${item.description}`}
    >
      {content}
    </Link>
  ) : (
    <div className={rowClass}>{content}</div>
  );
}

function getQuickActionFromLocation(location: string): Exclude<QuickAction, "none"> | null {
  const locationSearch = location.includes("?") ? location.slice(location.indexOf("?")) : "";
  const search = locationSearch || window.location.search;
  const action = new URLSearchParams(search).get("quick");
  return action === "income" || action === "expense" || action === "goal" ? action : null;
}

function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const SHARED_OVERVIEW_SHORTCUTS = [
  { href: "/budget", label: "Budget", description: "Plan spending", icon: Wallet },
  { href: "/contributions", label: "Contributions", description: "See money in", icon: TrendingUp },
  { href: "/expenses", label: "Expenses", description: "Review spending", icon: Receipt },
  { href: "/savings-goals", label: "Goals", description: "Track targets", icon: Target },
  { href: "/bank", label: "Bank", description: "Manage funds", icon: Landmark },
  { href: "/reports", label: "Reports", description: "Understand trends", icon: BarChart3 },
];

function OpenInvitationLinkButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);

  const openInvitation = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const invitationUrl = new URL(link.trim(), window.location.origin);
      const invitationRoute = routePath(invitationUrl.pathname, import.meta.env.BASE_URL);
      if (
        invitationUrl.origin !== window.location.origin ||
        !invitationRoute ||
        !/^\/(?:invite|join)\/[^/]+\/?$/.test(invitationRoute)
      ) {
        throw new Error("Paste a Jamvi email invitation or private group link.");
      }
      window.location.assign(`${appPath(invitationRoute, import.meta.env.BASE_URL)}${invitationUrl.search}${invitationUrl.hash}`);
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
         <DialogTitle>Join a Shared budget</DialogTitle>
          </DialogHeader>
          <form onSubmit={openInvitation} className="space-y-5">
            <p className="text-sm leading-relaxed text-muted-foreground">
               Paste the email invitation or private group link you received. It will add that Shared budget alongside any other budgets you can access after you accept.
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

function CreateSharedGroupCard({ hasExistingSharedBudget = false }: { hasExistingSharedBudget?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<SharedGroupKind | null>(null);
  const createSharedGroup = useCreateSharedGroup();
  const { toast } = useToast();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) {
      toast({
        variant: "destructive",
        title: "Group name required",
               description: "Enter at least two characters before creating a Shared budget.",
      });
      return;
    }
    if (!kind) {
      toast({
        variant: "destructive",
        title: "Choose a group type",
        description: "Choose what this Shared budget is for before creating it.",
      });
      return;
    }
    try {
      await createSharedGroup.mutateAsync({ data: { name: name.trim(), kind: kind as GroupKind } });
      window.location.assign(appPath("/", import.meta.env.BASE_URL));
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
             <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Your Personal budget is private</p>
            <h2 className="mt-1 font-display text-xl font-bold text-foreground">
              {hasExistingSharedBudget ? "Need another Shared budget?" : "Need to budget with other people?"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
               {hasExistingSharedBudget
                 ? "Create a separate Shared budget for another family, chama, club, team, or shared goal. It starts empty, stays separate from your other budgets, and only people you invite can join."
                 : "Create a Shared budget for your family, chama, club, team, or any shared goal. It starts empty, stays separate from your Personal budget, and only people you invite can join."}
            </p>
             <p className="mt-2 text-xs font-medium text-foreground/70">
               Name it, create it, then invite the people who should share it.
             </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <OpenInvitationLinkButton />
             <Button data-testid="create-shared-budget-cta" className="h-11 rounded-xl px-5" onClick={() => setIsOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {hasExistingSharedBudget ? "Create another Shared budget" : "Create a Shared budget"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setKind(null);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
             <DialogTitle>Create a Shared budget</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-5">
            <p className="text-sm leading-relaxed text-muted-foreground">
               You will be the owner. Personal budget records will stay private and will not be copied into this Shared budget.
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
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-foreground">What kind of group is this?</legend>
              <p className="text-xs text-muted-foreground">Choose one to tailor category recommendations for this Shared budget.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {SHARED_GROUP_KINDS.map((option) => {
                  const selected = kind === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setKind(option.value)}
                      className={`rounded-lg border p-3 text-left transition-colors ${selected ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border hover:border-primary/50 hover:bg-muted/50"}`}
                    >
                      <span className="block text-sm font-semibold text-foreground">{option.label}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{option.description}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <Button type="submit" className="w-full" disabled={createSharedGroup.isPending}>
               {createSharedGroup.isPending ? "Creating…" : "Create Shared budget"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SharedGroupsFooter() {
  const { data: workspaces = [], isLoading } = useGetWorkspaces();
  const sharedWorkspaces = workspaces.filter((workspace) => !workspace.isPrivate);

  if (isLoading) return null;
  return <CreateSharedGroupCard hasExistingSharedBudget={sharedWorkspaces.length > 0} />;
}

// ── Quick Action: Bank Deposit ────────────────────────────────────────────────
function IncomeForm({
  onDone,
  currentUserId,
  canManageShared,
  isSharedWorkspace,
}: {
  onDone: () => void;
  currentUserId?: string;
  canManageShared: boolean;
  isSharedWorkspace: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [madeById, setMadeById] = useState<string>("");
  const [incomeSourceId, setIncomeSourceId] = useState<number | null>(null);
  const { data: members = [] } = useGetMembers();
  const selectedDepositorId = canManageShared ? madeById : currentUserId ?? "";
  const createDeposit = useCreateDeposit();
  const qc = useQueryClient();
  const { toast } = useToast();
  const now = new Date();

  const { data: incomeSources } = useQuery<IncomeSource[]>({
    queryKey: ["income-sources", selectedDepositorId],
    queryFn: async () => {
      const res = await fetch(`/api/income-sources?userId=${selectedDepositorId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedDepositorId,
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
    if (!selectedDepositorId) {
      toast({
        variant: "destructive",
        title: "Choose who is depositing",
        description: isSharedWorkspace
          ? "Select a group member before recording this deposit."
          : "Your account is still loading. Please try again.",
      });
      return;
    }
    try {
      await createDeposit.mutateAsync({
        data: {
          amount: amt,
          description: description.trim() || "Deposit",
          date: now.toISOString().split("T")[0],
          madeById: selectedDepositorId,
          ...(incomeSourceId ? { incomeSourceId } : {}),
        } as Parameters<typeof createDeposit.mutateAsync>[0]["data"],
      });
      qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      qc.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
      qc.invalidateQueries({ queryKey: getGetJointAccountQueryKey() });
       const who = members.find(m => m.userId === selectedDepositorId)?.userName?.split(" ")[0] ?? (isSharedWorkspace ? "Member" : "You");
      toast({ title: "Deposit recorded", description: `${who} · ${formatKes(amt)} added to this month.` });
      onDone();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not record deposit",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {canManageShared ? (
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">Who is depositing?</label>
          <div className="grid grid-cols-2 gap-2">
            {members.map((m) => {
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
      ) : (
        <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
          <p className="text-sm font-semibold text-foreground">
            {isSharedWorkspace ? "Depositing in your own name" : "Personal account deposit"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isSharedWorkspace
              ? "This deposit will be added under your membership."
              : "This money will be recorded only in your Personal budget."}
          </p>
        </div>
      )}
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
        <Button type="submit" className="h-12 flex-1 rounded-xl bg-success px-6 text-base text-success-foreground hover:bg-success/90" disabled={createDeposit.isPending}>
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
  canManageCategories,
}: {
  onDone: () => void;
  currentUserId?: string;
  canManageShared: boolean;
  canManageCategories: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [incomeSourceId, setIncomeSourceId] = useState<number | null>(null);
  const [isAddingSource, setIsAddingSource] = useState(false);
  const [newSourceName, setNewSourceName] = useState("");
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryBudget, setNewCategoryBudget] = useState("");
  const [paidFromBank, setPaidFromBank] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [date, setDate] = useState(localDateInputValue());
  const { data: categories = [] } = useGetBudgetCategories();
  const { data: members = [] } = useGetMembers();
  const payerId = paidBy || (!canManageShared ? currentUserId : "");
  const { data: incomeSources = [], isLoading: isIncomeSourcesLoading } = useGetIncomeSources(
    { userId: payerId },
    {
      query: {
        enabled: Boolean(payerId),
        queryKey: getGetIncomeSourcesQueryKey({ userId: payerId }),
      },
    },
  );
  const selectableMembers = canManageShared
    ? members
    : members.filter((member) => member.userId === currentUserId);
  const createExpense = useCreateExpense();
  const createCategory = useCreateBudgetCategory();
  const qc = useQueryClient();
  const { toast } = useToast();
  const today = localDateInputValue();

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    const budgetAmount = Number(newCategoryBudget);
    if (!name || !Number.isInteger(budgetAmount) || budgetAmount < 0) {
      toast({
        variant: "destructive",
        title: "Add a category name and monthly budget",
        description: "The monthly budget must be a whole number of KES or zero.",
      });
      return;
    }
    try {
      const created = await createCategory.mutateAsync({
        data: { name, budgetAmount, priority: 1, isRecurring: true },
      });
      setCategory(created.name);
      setNewCategoryName("");
      setNewCategoryBudget("");
      setIsAddingCategory(false);
      await qc.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
      toast({ title: "Category added", description: `${created.name} is selected for this expense.` });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not add category",
        description: error instanceof Error ? error.message : "Check the name and try again.",
      });
    }
  };

  const handleAddSource = async () => {
    const name = newSourceName.trim();
    if (!payerId) return;
    if (!name) {
      toast({
        variant: "destructive",
        title: "Source name required",
        description: "Enter a name before adding the income source.",
      });
      return;
    }
    try {
      const response = await fetch("/api/income-sources", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: payerId, name, isMain: false }),
      });
      if (!response.ok) {
        throw new Error("Could not create source");
      }
      const source: IncomeSource = await response.json();
      setIncomeSourceId(source.id);
      setNewSourceName("");
      setIsAddingSource(false);
      await qc.invalidateQueries({ queryKey: getGetIncomeSourcesQueryKey({ userId: payerId }) });
      toast({ title: "Income source added", description: `${source.name} is selected for this expense.` });
    } catch {
      toast({
        variant: "destructive",
        title: "Could not add income source",
        description: "Check the name and try again.",
      });
    }
  };

  useEffect(() => {
    if (!canManageShared && currentUserId && paidBy !== currentUserId) {
      setPaidBy(currentUserId);
    }
  }, [canManageShared, currentUserId, paidBy]);

  useEffect(() => {
    if (!paidBy && selectableMembers.length === 1) {
      setPaidBy(selectableMembers[0].userId);
    }
  }, [paidBy, selectableMembers]);

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
    if (!category) {
      toast({
        variant: "destructive",
        title: "Choose a category",
        description: "Select a category before logging this expense.",
      });
      return;
    }
    if (!paidBy && !paidFromBank) {
      toast({
        variant: "destructive",
        title: "Choose who paid",
        description: "Select the person who paid, or choose the joint bank account.",
      });
      return;
    }
    if (!paidFromBank && !incomeSourceId) {
      toast({
        variant: "destructive",
        title: "Income source required",
        description: "Choose the saved income stream that funded this expense, or select the joint bank account.",
      });
      return;
    }
    if (date > today) {
      toast({
        variant: "destructive",
        title: "Future date not allowed",
        description: "Use today or an earlier date for an expense.",
      });
      return;
    }
    try {
      await createExpense.mutateAsync({
        data: {
          amount: amt,
          description,
          category: category,
          notes: notes.trim() || undefined,
          paidById: paidFromBank ? undefined : (paidBy || currentUserId),
          paidFromBank,
          isRecurring,
          date,
          ...(incomeSourceId && !paidFromBank ? { incomeSourceId } : {}),
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
          <label className="text-sm font-semibold text-foreground">Category <span className="text-destructive">*</span></label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full h-11 rounded-lg border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">Pick a category</option>
              {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            {canManageCategories && (
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0"
                onClick={() => setIsAddingCategory((open) => !open)}
                aria-expanded={isAddingCategory}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create category
              </Button>
            )}
          </div>
          {canManageCategories && isAddingCategory && (
            <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Create a category</p>
                <p className="mt-0.5 text-xs text-muted-foreground">It will be saved to this budget and selected here.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
                <Input
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  placeholder="e.g. Transport"
                  maxLength={60}
                  className="h-10 bg-card"
                />
                <Input
                  value={newCategoryBudget}
                  onChange={(event) => setNewCategoryBudget(event.target.value)}
                  placeholder="Monthly KES"
                  type="number"
                  min="0"
                  step="1"
                  className="h-10 bg-card"
                />
                <Button type="button" className="h-10" disabled={createCategory.isPending} onClick={() => void handleAddCategory()}>
                  {createCategory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                </Button>
              </div>
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">
            Paid by <span className="text-destructive">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
             {selectableMembers.map((m) => {
              const name = m.userName?.split(" ")[0] ?? "Member";
              return (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => {
                    setPaidBy(m.userId);
                    setPaidFromBank(false);
                    setIncomeSourceId(null);
                  }}
                  className={`h-11 rounded-lg border text-sm font-semibold transition-colors ${paidBy === m.userId ? "bg-primary text-primary-foreground border-primary" : "bg-card border-input text-foreground hover:bg-muted/40"}`}>
                  {name}
                </button>
              );
            })}
          </div>
          {!paidBy && !paidFromBank && <p className="text-xs text-muted-foreground">Choose who paid before saving.</p>}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">Notes <span className="text-muted-foreground font-normal">(optional)</span></label>
          <Input placeholder="Any extra details…" value={notes} onChange={e => setNotes(e.target.value)} className="h-11 bg-card" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">Date <span className="text-destructive">*</span></label>
          <Input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            max={canManageShared ? undefined : today}
            className="h-11 bg-card"
          />
          {!canManageShared && <p className="text-xs text-muted-foreground">Members can record expenses for today only.</p>}
        </div>
      </div>
      {!paidFromBank && (
        <div className="space-y-1.5">
           <label className="text-sm font-semibold text-foreground">
             Financed by <span className="text-destructive">*</span>
          </label>
          {!payerId ? (
            <p className="text-xs text-muted-foreground">Choose who paid above to see their income streams.</p>
          ) : isIncomeSourcesLoading ? (
            <p className="text-xs text-muted-foreground">Loading income sources…</p>
          ) : incomeSources.length > 0 ? (
            <select
              value={incomeSourceId?.toString() ?? ""}
              onChange={e => setIncomeSourceId(e.target.value ? Number(e.target.value) : null)}
              className="w-full h-11 rounded-lg border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
               <option value="">Select an income source...</option>
              {incomeSources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}
            </select>
          ) : (
            <p className="text-xs text-muted-foreground">No income sources set up yet. Add one from Budget.</p>
          )}
           {payerId && (
             <div className="flex flex-wrap items-center gap-2">
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
          <p className="text-xs text-muted-foreground">Choosing a source helps Jamvi track where this spending was funded from.</p>
        </div>
      )}
      {canManageShared && (
        <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => {
              const nextPaidFromBank = !paidFromBank;
              setPaidFromBank(nextPaidFromBank);
              if (nextPaidFromBank) {
                setPaidBy("");
                setIncomeSourceId(null);
              }
            }}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors sm:shrink-0 ${paidFromBank ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-300" : "border-input bg-card text-foreground hover:bg-muted/40"}`}
          >
            🏦 Joint bank account
          </button>
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
            <span>
              <span className="font-semibold">Recurring expense</span>
              <span className="block text-xs text-muted-foreground">Remind me to apply this next month.</span>
            </span>
          </label>
        </div>
      )}
      <div className="flex gap-3">
        <Button type="submit" className="h-11 rounded-xl bg-warning px-6 text-warning-foreground hover:bg-warning/90" disabled={createExpense.isPending}>
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
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const [location] = useLocation();
  const requestedQuickAction = getQuickActionFromLocation(location);
  const [activeAction, setActiveAction] = useState<QuickAction>(() => requestedQuickAction ?? "none");
  const { user } = useAuth();

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
  const canManageBank = canManageBankAccount(group);

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
        <div className="flex items-center gap-3">
          <ProfileAvatar user={user} className="h-12 w-12 sm:h-14 sm:w-14" textClassName="text-lg" alt={user?.firstName ?? "User"} />
          <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">
            {isSharedWorkspace ? "Shared budget" : "Personal budget"}
          </p>
          <h1 className="mt-1 text-2xl font-display font-bold text-foreground sm:text-3xl">
            {group?.isPrivate ? "Personal overview" : "Group overview"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(now)}
          </p>
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

      {isSharedWorkspace && (
        <section aria-labelledby="group-overview-shortcuts-heading" className="rounded-2xl border border-primary/15 bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Group overview</p>
            <h2 id="group-overview-shortcuts-heading" className="mt-1 font-display text-xl font-bold text-foreground">
              Go straight to a budget area
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Open the shared budget, contributions, expenses, goals, bank, or reports without hunting through the menu.
            </p>
          </div>
          <nav aria-label="Group overview shortcuts" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {SHARED_OVERVIEW_SHORTCUTS.map((shortcut) => {
              const ShortcutIcon = shortcut.icon;
              return (
                <Link
                  key={shortcut.href}
                  href={shortcut.href}
                  data-testid={`overview-shortcut-${shortcut.label.toLowerCase()}`}
                  className="group flex min-h-20 min-w-0 items-center gap-3 rounded-xl border border-border/80 bg-background px-3 py-3 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <ShortcutIcon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block w-full whitespace-normal break-words text-sm font-bold leading-tight text-foreground">{shortcut.label}</span>
                    <span className="mt-1 block w-full whitespace-normal break-words text-xs leading-tight text-muted-foreground">{shortcut.description}</span>
                  </span>
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              );
            })}
          </nav>
        </section>
      )}

       {/* ── Quick Actions ── */}
        <Card id="dashboard-quick-actions" className="scroll-mt-6 overflow-hidden border-none shadow-md">
        <CardContent className="p-0">
          {/* Action buttons row */}
          <div className="grid grid-cols-2 divide-x divide-y divide-border/50 sm:grid-cols-5 sm:divide-y-0">
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
              {activeAction === "expense" && <ExpenseForm onDone={() => setActiveAction("none")} currentUserId={user?.id} canManageShared={canManageShared} canManageCategories={canManageCategories} />}
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
                  <DashboardActivityRow key={item.id} item={item} />
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
                  <p className="font-semibold text-foreground">{isSharedWorkspace ? "Joint Account" : "Personal Account"}</p>
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
                    <DashboardActivityRow key={item.id} item={item} compact />
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

    </div>
  );
}
