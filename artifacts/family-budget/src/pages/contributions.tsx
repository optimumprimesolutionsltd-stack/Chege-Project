import { useState, useEffect, useMemo, type FormEvent } from "react";
import {
  useGetDashboardSummary,
  useGetDashboardIncomeStreams,
  useGetGroup,
  useGetMembers,
  useGetContributions,
  useUpdateContribution,
  useDeleteContribution,
  getGetContributionsQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetDashboardActivityQueryKey,
  getGetDashboardIncomeStreamsQueryKey,
  getGetDashboardPeriodTotalsQueryKey,
  type Contribution,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatKes, formatMonthYear } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Calendar, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type MemberContrib = { userId: string; name: string; contributed: number; spent: number; net: number; target: number | null };
type IncomeStream = {
  incomeSourceId?: number | null;
  sourceName: string;
  ownerId?: string | null;
  ownerName: string;
  total: number;
  expectedMonthlyAmount: number;
  remainingBalance: number;
  variance: number;
  transactionCount: number;
};
const MEMBER_ACCENT_COLORS = ["#08B7B0", "#FDBB0A", "#003383", "#3CDD62", "#6C9FE6"];

const CONTRIBUTIONS_MONTH_KEY = "contributions-month-pref";

function getContributionDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const month = Number(params.get("month"));
  const year = Number(params.get("year"));
  const editId = Number(params.get("edit"));
  return {
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : null,
    year: Number.isInteger(year) && year >= 2000 && year <= 2200 ? year : null,
    editId: Number.isInteger(editId) && editId > 0 ? editId : null,
  };
}

type ContributionEditor = {
  id: number;
  amount: string;
  month: number;
  year: number;
  note: string;
  forUserId: string;
};

function wasCreatedToday(createdAt: string) {
  return new Date(createdAt).toDateString() === new Date().toDateString();
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  return (
    <div className="h-2 rounded-full bg-muted overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct * 100}%`, backgroundColor: color }} />
    </div>
  );
}

function MemberCard({
  member, accentColor, incomeStreams, isIncomeStreamsLoading, incomeStreamsError, onOpenLedger,
}: {
  member: MemberContrib;
  accentColor: string;
  incomeStreams: IncomeStream[];
  isIncomeStreamsLoading: boolean;
  incomeStreamsError: boolean;
  onOpenLedger: () => void;
}) {
  const { userId, name, contributed, spent, net, target } = member;
  const pct = target && target > 0 ? Math.min((contributed / target) * 100, 100) : 0;
  const expectedFromSources = incomeStreams.reduce((sum, stream) => sum + stream.expectedMonthlyAmount, 0);
  const trackedFunding = incomeStreams.reduce((sum, stream) => sum + stream.total, 0);
  const sourceBalance = expectedFromSources - trackedFunding;

  return (
    <Card className="border-none shadow-md overflow-hidden">
      <div className="h-1" style={{ backgroundColor: accentColor }} />
      <CardContent className="pt-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xl font-display font-bold text-foreground">{name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Target: {target == null ? "Not set" : `${formatKes(target)}/month`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-display font-bold" style={{ color: accentColor }}>
              {formatKes(contributed)}
            </p>
            <p className="text-xs text-muted-foreground">contributed</p>
          </div>
        </div>

        {/* Progress */}
        <ProgressBar value={contributed} max={target ?? 0} color={accentColor} />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{Math.round(pct)}% of target</span>
          {contributed < (target ?? 0)
            ? <span>{formatKes((target ?? 0) - contributed)} remaining</span>
            : <span className="font-semibold" style={{ color: accentColor }}>Target hit ✓</span>}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-muted/50 rounded-xl p-3 text-center">
            <p className="text-xs text-muted-foreground mb-0.5">Contributed</p>
            <p className="font-display font-bold text-sm text-foreground">{formatKes(contributed)}</p>
          </div>
          <div className="bg-muted/50 rounded-xl p-3 text-center">
            <p className="text-xs text-muted-foreground mb-0.5">Spent</p>
            <p className="font-display font-bold text-sm text-destructive">{formatKes(spent)}</p>
          </div>
          <div className="bg-muted/50 rounded-xl p-3 text-center">
            <p className="text-xs text-muted-foreground mb-0.5">Net</p>
            <p className={`font-display font-bold text-sm ${net >= 0 ? "text-success" : "text-destructive"}`}>
              {net >= 0 ? "+" : ""}{formatKes(net)}
            </p>
          </div>
        </div>

        {/* Income source plan */}
        <div className="space-y-2.5 pt-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Income source plan</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Expected funding compared with what this member has contributed.</p>
            </div>
            {!isIncomeStreamsLoading && !incomeStreamsError && incomeStreams.length > 0 && (
              <span className="shrink-0 text-xs font-semibold" style={{ color: accentColor }}>
                {formatKes(trackedFunding)} recorded
              </span>
            )}
          </div>

          {isIncomeStreamsLoading ? (
            <div className="h-16 animate-pulse rounded-xl bg-muted/60" />
          ) : incomeStreamsError ? (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
              We couldn’t load this income-source plan. Try refreshing the page.
            </p>
          ) : incomeStreams.length === 0 ? (
            <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              No income source has been set for {name} yet.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-muted/50 p-2.5">
                  <p className="text-[11px] text-muted-foreground">Expected</p>
                  <p className="mt-0.5 text-sm font-display font-bold">{formatKes(expectedFromSources)}</p>
                </div>
                <div className="rounded-xl bg-muted/50 p-2.5">
                  <p className="text-[11px] text-muted-foreground">Recorded</p>
                  <p className="mt-0.5 text-sm font-display font-bold" style={{ color: accentColor }}>{formatKes(trackedFunding)}</p>
                </div>
                <div className="rounded-xl bg-muted/50 p-2.5">
                  <p className="text-[11px] text-muted-foreground">{sourceBalance < 0 ? "Above" : "Remaining"}</p>
                  <p className={`mt-0.5 text-sm font-display font-bold ${sourceBalance < 0 ? "text-primary" : ""}`}>
                    {formatKes(Math.abs(sourceBalance))}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {incomeStreams.map((stream) => {
                  const aboveExpected = stream.remainingBalance < 0;
                  return (
                    <div key={stream.incomeSourceId ?? stream.sourceName} className="rounded-xl border border-border/70 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{stream.sourceName}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Expected {formatKes(stream.expectedMonthlyAmount)} · Recorded {formatKes(stream.total)}
                          </p>
                        </div>
                        <p className={`shrink-0 text-xs font-semibold ${aboveExpected ? "text-primary" : "text-muted-foreground"}`}>
                          {aboveExpected ? `${formatKes(Math.abs(stream.remainingBalance))} above` : `${formatKes(stream.remainingBalance)} left`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenLedger}
          className="text-sm font-semibold text-primary hover:underline"
          data-testid={`open-contribution-ledger-${userId}`}
        >
          Open contribution ledger →
        </button>
      </CardContent>
    </Card>
  );
}

export default function Contributions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: group } = useGetGroup();
  const { data: members } = useGetMembers();
  const isSharedWorkspace = group?.isPrivate === false;
  const now = new Date();
  const contributionDeepLink = getContributionDeepLink();
  const [month, setMonth] = useState(() => {
    if (contributionDeepLink.month != null && contributionDeepLink.year != null) return contributionDeepLink.month;
    try {
      const raw = localStorage.getItem(CONTRIBUTIONS_MONTH_KEY);
      if (raw) { const p = JSON.parse(raw); if (typeof p?.month === "number") return p.month; }
    } catch {}
    return now.getMonth() + 1;
  });
  const [year, setYear] = useState(() => {
    if (contributionDeepLink.month != null && contributionDeepLink.year != null) return contributionDeepLink.year;
    try {
      const raw = localStorage.getItem(CONTRIBUTIONS_MONTH_KEY);
      if (raw) { const p = JSON.parse(raw); if (typeof p?.year === "number") return p.year; }
    } catch {}
    return now.getFullYear();
  });

  useEffect(() => {
    try { localStorage.setItem(CONTRIBUTIONS_MONTH_KEY, JSON.stringify({ month, year })); } catch {}
  }, [month, year]);

  const { data: summary, isLoading } = useGetDashboardSummary({ month, year });
  const {
    data: incomeStreamReport,
    isLoading: isIncomeStreamsLoading,
    isError: incomeStreamsError,
  } = useGetDashboardIncomeStreams({ month, year });
  const {
    data: contributions,
    isLoading: isContributionsLoading,
    isError: contributionsError,
  } = useGetContributions({ month, year });
  const updateContribution = useUpdateContribution();
  const deleteContribution = useDeleteContribution();
  const [editor, setEditor] = useState<ContributionEditor | null>(null);
  const [contributionToRemove, setContributionToRemove] = useState<Contribution | null>(null);
  const [openedDeepLinkId, setOpenedDeepLinkId] = useState<number | null>(null);

  const handlePrevMonth = () => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); };
  const handleNextMonth = () => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); };

  const memberContribs = ((summary as any)?.memberContributions ?? []) as MemberContrib[];
  const currentMembership = members?.find((member) => member.userId === user?.id);
  const canManageContributions =
    group?.isPrivate === true ||
    group?.role === "owner" || group?.role === "admin" ||
    currentMembership?.role === "owner" || currentMembership?.role === "admin";
  const canEditContribution = (contribution: Contribution) =>
    canManageContributions ||
    (contribution.userId === user?.id && wasCreatedToday(contribution.createdAt));

  const clearContributionDeepLink = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete("edit");
    const search = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`);
  };

  const openContributionLedger = () => {
    document.getElementById("contribution-ledger")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (!contributionDeepLink.editId || openedDeepLinkId === contributionDeepLink.editId || !contributions) return;
    const target = contributions.find((contribution) => contribution.id === contributionDeepLink.editId);
    if (!target || !canEditContribution(target)) return;
    startEditContribution(target);
    setOpenedDeepLinkId(target.id);
    window.setTimeout(openContributionLedger, 0);
  }, [contributionDeepLink.editId, contributions, openedDeepLinkId, canManageContributions, user?.id]);

  const invalidateContributionData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetContributionsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetDashboardIncomeStreamsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetDashboardPeriodTotalsQueryKey() }),
    ]);
  };

  const startEditContribution = (contribution: Contribution) => {
    if (!canEditContribution(contribution)) {
      toast({
        variant: "destructive",
        title: "An admin needs to correct this record",
        description: "Members can edit only their own contribution recorded today.",
      });
      return;
    }
    setEditor({
      id: contribution.id,
      amount: String(contribution.amount),
      month: contribution.month,
      year: contribution.year,
      note: contribution.note ?? "",
      forUserId: contribution.userId,
    });
  };

  const saveContribution = async (event: FormEvent) => {
    event.preventDefault();
    if (!editor) return;
    const amount = Number(editor.amount);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
      toast({ variant: "destructive", title: "Enter a whole KES amount greater than zero" });
      return;
    }
    if (!Number.isInteger(editor.month) || editor.month < 1 || editor.month > 12 ||
      !Number.isInteger(editor.year) || editor.year < 2000 || editor.year > 2200) {
      toast({ variant: "destructive", title: "Enter a valid contribution month and year" });
      return;
    }
    try {
      await updateContribution.mutateAsync({
        id: editor.id,
        data: {
          amount, month: editor.month, year: editor.year,
          note: editor.note.trim() || undefined,
          ...(canManageContributions ? { forUserId: editor.forUserId } : {}),
        },
      });
      setEditor(null);
      clearContributionDeepLink();
      await invalidateContributionData();
      toast({ title: "Contribution updated" });
    } catch {
      toast({
        variant: "destructive",
        title: "Could not update contribution",
        description: "Check the details and try again.",
      });
    }
  };

  const confirmRemoveContribution = async () => {
    if (!contributionToRemove) return;
    try {
      await deleteContribution.mutateAsync({ id: contributionToRemove.id });
      setContributionToRemove(null);
      await invalidateContributionData();
      toast({ title: "Contribution removed" });
    } catch {
      toast({
        variant: "destructive",
        title: "Could not remove contribution",
        description: "Please try again or contact an admin.",
      });
    }
  };
  const totalContrib = memberContribs.reduce((s, m) => s + m.contributed, 0);
  const totalTarget = memberContribs.reduce((s, m) => s + (m.target ?? 0), 0);
  const streamsByMember = useMemo(() => {
    const streams = new Map<string, IncomeStream[]>();
    for (const stream of incomeStreamReport?.streams ?? []) {
      if (!stream.ownerId || stream.incomeSourceId == null) continue;
      const rows = streams.get(stream.ownerId) ?? [];
      rows.push(stream);
      streams.set(stream.ownerId, rows);
    }
    return streams;
  }, [incomeStreamReport]);
  const totalExpectedFromSources = (incomeStreamReport?.streams ?? [])
    .filter(stream => stream.incomeSourceId != null)
    .reduce((sum, stream) => sum + stream.expectedMonthlyAmount, 0);
  const trackedFundingFromSources = (incomeStreamReport?.streams ?? [])
    .filter(stream => stream.incomeSourceId != null)
    .reduce((sum, stream) => sum + stream.total, 0);
  const sourcePlanBalance = totalExpectedFromSources - trackedFundingFromSources;
  const unattributedFunding = incomeStreamReport?.streams.find(stream => stream.incomeSourceId == null);

  return (
    <div className="min-w-0 overflow-x-hidden space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">{isSharedWorkspace ? "Group Contributions" : "My Contributions"}</h1>
          <p className="text-muted-foreground mt-1">
            {isSharedWorkspace
              ? "Group contributions from expenses paid, joint-account deposits, and shared goals."
              : "Your contributions from expenses paid, deposits made, and goals saved."}
          </p>
        </div>

        {/* Month picker */}
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
                const m = d.getMonth() + 1;
                const y = d.getFullYear();
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

      {/* How it works banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/8 border border-primary/20">
        <TrendingUp className="w-5 h-5 text-primary mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-foreground">Contributions are tracked automatically</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Every expense you pay, bank deposit you make, and savings goal contribution you add counts toward your total. Tag an income source to track which stream funded it.
          </p>
        </div>
      </div>

      {/* Contribution records */}
      <Card id="contribution-ledger" className="scroll-mt-6 border-none shadow-md">
        <CardContent className="pt-5">
          <div className="flex flex-col gap-1 border-b border-border/60 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-bold text-foreground">Contribution records</h2>
              <p className="text-sm text-muted-foreground">
                Records for {formatMonthYear(month, year)}.
              </p>
            </div>
            <p className="text-xs font-medium text-muted-foreground">
              {contributions?.length ?? 0} recorded
            </p>
          </div>

          {!canManageContributions && (
            <p className="mt-4 rounded-xl bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">
              Members can edit only their own record created today. Admins handle removals and older corrections.
            </p>
          )}

          <div className="mt-4 space-y-3">
            {isContributionsLoading ? (
              <div className="h-24 animate-pulse rounded-xl bg-muted/60" />
            ) : contributionsError ? (
              <p className="rounded-xl bg-destructive/10 px-3 py-3 text-sm text-destructive">
                We couldn’t load contribution records. Refresh the page and try again.
              </p>
            ) : contributions?.length === 0 ? (
              <p className="rounded-xl bg-muted/50 px-3 py-4 text-sm text-muted-foreground">
                No contribution records have been added for this month.
              </p>
            ) : contributions?.map((contribution) => {
              const isEditing = editor?.id === contribution.id;
              const mayEdit = canEditContribution(contribution);
              return (
                <div key={contribution.id} className="rounded-xl border border-border/70 p-3 sm:p-4">
                  {isEditing && editor ? (
                    <form onSubmit={saveContribution} className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-display font-bold text-foreground">Edit contribution</h3>
                        <Button type="button" variant="ghost" onClick={() => { setEditor(null); clearContributionDeepLink(); }}>Cancel</Button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1.5 text-sm font-medium text-foreground">
                          Amount (KES)
                          <Input
                            type="number" min="1" step="1" required value={editor.amount}
                            onChange={(event) => setEditor({ ...editor, amount: event.target.value })}
                          />
                        </label>
                        <label className="space-y-1.5 text-sm font-medium text-foreground">
                          Member attribution
                          {canManageContributions ? (
                            <select
                              value={editor.forUserId}
                              onChange={(event) => setEditor({ ...editor, forUserId: event.target.value })}
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                              {!members?.some((member) => member.userId === editor.forUserId) && (
                                <option value={editor.forUserId}>{contribution.userName}</option>
                              )}
                              {members?.map((member) => (
                                <option key={member.userId} value={member.userId}>
                                  {member.userName || "Household member"}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <Input value={contribution.userName} disabled />
                          )}
                        </label>
                        <label className="space-y-1.5 text-sm font-medium text-foreground">
                          Month
                          <select
                            value={editor.month}
                            onChange={(event) => setEditor({ ...editor, month: Number(event.target.value) })}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          >
                            {Array.from({ length: 12 }, (_, index) => (
                              <option key={index + 1} value={index + 1}>
                                {new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(2000, index, 1))}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1.5 text-sm font-medium text-foreground">
                          Year
                          <Input
                            type="number" min="2000" max="2200" required value={editor.year}
                            onChange={(event) => setEditor({ ...editor, year: Number(event.target.value) })}
                          />
                        </label>
                      </div>
                      <label className="block space-y-1.5 text-sm font-medium text-foreground">
                        Note
                        <textarea
                          value={editor.note}
                          onChange={(event) => setEditor({ ...editor, note: event.target.value })}
                          className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          placeholder="Optional note"
                        />
                      </label>
                      <Button type="submit" disabled={updateContribution.isPending}>
                        {updateContribution.isPending ? "Saving…" : "Save changes"}
                      </Button>
                    </form>
                  ) : (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <p className="font-semibold text-foreground">{contribution.userName}</p>
                          <p className="font-display text-lg font-bold text-primary">{formatKes(contribution.amount)}</p>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Recorded {formatDate(contribution.createdAt)}
                          {contribution.note ? ` · ${contribution.note}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {mayEdit && (
                          <Button type="button" variant="outline" onClick={() => startEditContribution(contribution)}>
                            Edit
                          </Button>
                        )}
                        {canManageContributions && (
                          <Button type="button" variant="destructive" onClick={() => setContributionToRemove(contribution)}>
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Combined total */}
      {summary && (
        <Card className="border-none shadow-md">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Group total</p>
              <p className="text-xs text-muted-foreground">{formatMonthYear(month, year)}</p>
            </div>
            <div className="flex items-end gap-3">
              <p className="text-3xl font-display font-bold text-foreground">{formatKes(totalContrib)}</p>
              <p className="text-muted-foreground text-sm mb-1">of {formatKes(totalTarget)}</p>
            </div>
            <div className="mt-3">
              <ProgressBar value={totalContrib} max={totalTarget} color="#003383" />
              <p className="text-xs text-muted-foreground mt-1.5">
                {Math.round(totalTarget > 0 ? (totalContrib / totalTarget) * 100 : 0)}% of combined target
              </p>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3 border-t pt-4">
              <div>
                <p className="text-xs text-muted-foreground">Income-source expected</p>
                <p className="mt-1 font-display text-lg font-bold">
                  {isIncomeStreamsLoading ? "Loading…" : incomeStreamsError ? "Unavailable" : formatKes(totalExpectedFromSources)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Recorded from sources</p>
                <p className="mt-1 font-display text-lg font-bold text-primary">
                  {isIncomeStreamsLoading ? "Loading…" : incomeStreamsError ? "Unavailable" : formatKes(trackedFundingFromSources)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{sourcePlanBalance < 0 ? "Above income plan" : "Still expected"}</p>
                <p className="mt-1 font-display text-lg font-bold">
                  {isIncomeStreamsLoading ? "Loading…" : incomeStreamsError ? "Unavailable" : formatKes(Math.abs(sourcePlanBalance))}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={openContributionLedger}
              className="mt-4 text-sm font-semibold text-primary hover:underline"
              data-testid="open-group-contribution-ledger"
            >
              Open contribution ledger →
            </button>
          </CardContent>
        </Card>
      )}

      {unattributedFunding && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-foreground">
          <p className="font-semibold">Unattributed funding: {formatKes(unattributedFunding.total)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            This funding has no selected income source, so it is kept separate from each member’s income plan.
          </p>
        </div>
      )}

      {/* Per-person cards */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : summary ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {memberContribs.map((m, idx) => (
            <MemberCard
              key={m.userId}
              member={m}
              accentColor={MEMBER_ACCENT_COLORS[idx % MEMBER_ACCENT_COLORS.length]}
              incomeStreams={streamsByMember.get(m.userId) ?? []}
              isIncomeStreamsLoading={isIncomeStreamsLoading}
              incomeStreamsError={incomeStreamsError}
              onOpenLedger={openContributionLedger}
            />
          ))}
        </div>
      ) : null}

      <AlertDialog
        open={contributionToRemove !== null}
        onOpenChange={(open) => {
          if (!open && !deleteContribution.isPending) setContributionToRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this contribution?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the {contributionToRemove ? formatKes(contributionToRemove.amount) : ""} contribution
              {contributionToRemove ? ` recorded for ${contributionToRemove.userName}` : ""}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteContribution.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmRemoveContribution();
              }}
              disabled={deleteContribution.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteContribution.isPending ? "Removing…" : "Remove contribution"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
