import { useMemo, useState } from "react";
import {
  getGetDashboardActivityQueryKey,
  getGetDashboardIncomeStreamsQueryKey,
  getGetDashboardSummaryQueryKey,
  useGetDashboardActivity,
  useGetDashboardIncomeStreams,
  useGetDashboardSummary,
  useGetGroup,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatKes, formatDate, formatMonthYear } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Loader2, Activity as ActivityIcon, Calendar, Pencil, TrendingUp } from "lucide-react";
import { ACTIVITY_TYPE } from "@/lib/activityTypes";

type ActivityTab = "all" | "expenses" | "contributions";
type MemberContribution = { userId: string; name: string; contributed: number; spent: number; net: number; target: number | null };
type IncomeStream = {
  incomeSourceId?: number | null;
  sourceName: string;
  ownerId?: string | null;
  total: number;
  expectedMonthlyAmount: number;
  remainingBalance: number;
};

export default function Activity() {
  const { data: group } = useGetGroup();
  const isSharedWorkspace = group?.isPrivate === false;
  const now = new Date();
  const [tab, setTab] = useState<ActivityTab>(() =>
    window.location.pathname === "/contributions" || window.location.search.includes("tab=contributions") ? "contributions" : "all",
  );
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const recentActivity = useGetDashboardActivity(
    undefined,
    { query: { queryKey: getGetDashboardActivityQueryKey(), retry: false, enabled: tab !== "contributions" } },
  );
  const monthlyActivity = useGetDashboardActivity(
    { month, year },
    { query: { queryKey: getGetDashboardActivityQueryKey({ month, year }), retry: false, enabled: tab === "contributions" } },
  );
  const { data: summary, isLoading: summaryLoading, isError: summaryError } = useGetDashboardSummary(
    { month, year },
    { query: { queryKey: getGetDashboardSummaryQueryKey({ month, year }), retry: false, enabled: tab === "contributions" } },
  );
  const incomeStreamReport = useGetDashboardIncomeStreams(
    { month, year },
    { query: { queryKey: getGetDashboardIncomeStreamsQueryKey({ month, year }), retry: false, enabled: tab === "contributions" } },
  );
  const activity = tab === "contributions" ? monthlyActivity.data : recentActivity.data;
  const isLoading = tab === "contributions" ? monthlyActivity.isLoading : recentActivity.isLoading;
  const activityError = tab === "contributions" ? monthlyActivity.isError : recentActivity.isError;
  const filteredActivity = useMemo(() => (activity ?? []).filter((item) => {
    if (tab === "expenses" && item.type !== ACTIVITY_TYPE.EXPENSE) return false;
    if (tab === "contributions" && item.type !== ACTIVITY_TYPE.CONTRIBUTION) return false;
    return true;
  }), [activity, tab]);
  const dailyActivityGroups = useMemo(() => {
    const groups = new Map<string, { date: string; items: typeof filteredActivity }>();
    for (const item of filteredActivity) {
      // Expenses and deposits use a date-only business date; savings entries use
      // an ISO timestamp. The first ten characters preserve the recorded day
      // without shifting it because of the viewer's time zone.
      const date = item.date.slice(0, 10);
      const group = groups.get(date);
      if (group) group.items.push(item);
      else groups.set(date, { date, items: [item] });
    }
    return [...groups.values()];
  }, [filteredActivity]);
  const sharedHouseholdActivity = useMemo(
    () => tab === "contributions" ? (activity ?? []).filter((item) => item.type === "household") : [],
    [activity, tab],
  );
  const members = ((summary as { memberContributions?: MemberContribution[] } | undefined)?.memberContributions ?? []);
  const totalContributed = members.reduce((total, member) => total + member.contributed, 0);
  const totalTarget = members.reduce((total, member) => total + (member.target ?? 0), 0);
  const streamsByMember = useMemo(() => {
    const streams = new Map<string, IncomeStream[]>();
    for (const stream of incomeStreamReport.data?.streams ?? []) {
      if (!stream.ownerId || stream.incomeSourceId == null) continue;
      const rows = streams.get(stream.ownerId) ?? [];
      rows.push(stream);
      streams.set(stream.ownerId, rows);
    }
    return streams;
  }, [incomeStreamReport.data]);
  const totalExpectedFromSources = (incomeStreamReport.data?.streams ?? [])
    .filter(stream => stream.incomeSourceId != null)
    .reduce((sum, stream) => sum + stream.expectedMonthlyAmount, 0);
  const recordedFromSources = (incomeStreamReport.data?.streams ?? [])
    .filter(stream => stream.incomeSourceId != null)
    .reduce((sum, stream) => sum + stream.total, 0);
  const sourcePlanBalance = totalExpectedFromSources - recordedFromSources;
  const unattributedFunding = incomeStreamReport.data?.streams.find(stream => stream.incomeSourceId == null);
  const previousMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1);
  };
  const expenseEditHref = (date: string, id: string) => {
    const expenseId = Number(id.slice("expense-".length));
    const expenseDate = new Date(date);
    const params = new URLSearchParams({
      edit: String(expenseId),
      month: String(expenseDate.getMonth() + 1),
      year: String(expenseDate.getFullYear()),
    });
    return `/expenses?${params.toString()}`;
  };

  return (
    <div className="space-y-5 pb-12 sm:space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground sm:text-3xl">{isSharedWorkspace ? "Group Activity" : "My Activity"}</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground sm:text-base">
            {isSharedWorkspace
              ? "Group expenses, contributions, and joint-account movements in one place."
              : "Your expenses, contributions, and account movements in one place."}
          </p>
        </div>
        {tab === "contributions" && (
          <div className="flex w-full items-center justify-between gap-2 rounded-xl border bg-card p-1 shadow-sm sm:w-auto sm:justify-start">
            <button aria-label="Previous month" onClick={previousMonth} className="h-9 w-9 rounded-lg hover:bg-muted">←</button>
            <span className="flex min-w-0 items-center justify-center gap-1.5 px-1 text-sm font-semibold sm:px-2"><Calendar className="h-4 w-4 shrink-0 text-primary" />{formatMonthYear(month, year)}</span>
            <button aria-label="Next month" onClick={nextMonth} disabled={month === now.getMonth() + 1 && year === now.getFullYear()} className="h-9 w-9 rounded-lg hover:bg-muted disabled:opacity-40">→</button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 rounded-xl bg-muted p-1 text-xs font-semibold sm:text-sm">
        {([
          ["all", "All activity"],
          ["expenses", "Expenses"],
          ["contributions", isSharedWorkspace ? "Group Contributions" : "My Contributions"],
        ] as const).map(([value, label]) => (
          <button key={value} onClick={() => setTab(value)}
            className={`min-w-0 whitespace-nowrap rounded-lg px-1.5 py-2.5 transition-colors sm:px-3 ${tab === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <span className="sm:hidden">{value === "all" ? "All" : value === "expenses" ? "Expenses" : "Contributions"}</span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {tab === "contributions" && (
        <>
          <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div><p className="text-sm font-semibold">Contributions are tracked automatically</p><p className="mt-0.5 text-xs text-muted-foreground">Personal expense portions, bank deposits, and savings contributions count once for the member who funded them. Joint-bank portions remain shared group funds.</p></div>
          </div>
          {summaryLoading ? <div className="flex justify-center py-8"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : summaryError ? (
            <Card className="border-destructive/30 bg-destructive/5"><CardContent className="py-6 text-center"><p className="font-semibold">We couldn’t load this month’s contribution report.</p><p className="mt-1 text-sm text-muted-foreground">Check your group access, then refresh and try again.</p></CardContent></Card>
          ) : (
            <div className="space-y-4">
              <Card className="border-none shadow-md"><CardContent className="pt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Group contribution total</p>
                <div className="mt-2 flex flex-col gap-0.5 sm:flex-row sm:items-end sm:gap-2"><p className="font-display text-3xl font-bold">{formatKes(totalContributed)}</p><span className="text-sm text-muted-foreground sm:mb-1">of {formatKes(totalTarget)} target</span></div>
                <div className="mt-5 grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-3">
                  <div><p className="text-xs text-muted-foreground">Income-source expected</p><p className="mt-1 font-display text-lg font-bold">{incomeStreamReport.isLoading ? "Loading…" : incomeStreamReport.isError ? "Unavailable" : formatKes(totalExpectedFromSources)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Recorded from sources</p><p className="mt-1 font-display text-lg font-bold text-primary">{incomeStreamReport.isLoading ? "Loading…" : incomeStreamReport.isError ? "Unavailable" : formatKes(recordedFromSources)}</p></div>
                  <div><p className="text-xs text-muted-foreground">{sourcePlanBalance < 0 ? "Above income plan" : "Still expected"}</p><p className="mt-1 font-display text-lg font-bold">{incomeStreamReport.isLoading ? "Loading…" : incomeStreamReport.isError ? "Unavailable" : formatKes(Math.abs(sourcePlanBalance))}</p></div>
                </div>
              </CardContent></Card>
              <div className="grid gap-4 md:grid-cols-2">
                {members.map((member) => {
                  const memberStreams = streamsByMember.get(member.userId) ?? [];
                  const expectedFromSources = memberStreams.reduce((sum, stream) => sum + stream.expectedMonthlyAmount, 0);
                  const recordedForMember = memberStreams.reduce((sum, stream) => sum + stream.total, 0);
                  const remainingForMember = expectedFromSources - recordedForMember;
                  return (
                  <Card key={member.userId} className="border-none shadow-md"><CardContent className="space-y-3 pt-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="break-words font-display text-lg font-bold">{member.name}</p><p className="text-xs text-muted-foreground">{member.target == null ? "No monthly target" : `${formatKes(member.target)} monthly target`}</p></div><p className="font-display text-xl font-bold text-primary">{formatKes(member.contributed)}</p></div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg bg-muted p-2"><p className="text-muted-foreground">Contributed</p><p className="mt-1 font-bold">{formatKes(member.contributed)}</p></div><div className="rounded-lg bg-muted p-2"><p className="text-muted-foreground">Spent</p><p className="mt-1 font-bold">{formatKes(member.spent)}</p></div><div className="rounded-lg bg-muted p-2"><p className="text-muted-foreground">Net</p><p className={`mt-1 font-bold ${member.net >= 0 ? "text-primary" : "text-destructive"}`}>{member.net >= 0 ? "+" : ""}{formatKes(member.net)}</p></div></div>
                    <div className="space-y-2 border-t pt-3">
                      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Income source plan</p><p className="mt-0.5 text-xs text-muted-foreground">Expected funding compared with what this member recorded.</p></div>{!incomeStreamReport.isLoading && !incomeStreamReport.isError && memberStreams.length > 0 && <p className="shrink-0 text-xs font-semibold text-primary">{formatKes(recordedForMember)} recorded</p>}</div>
                      {incomeStreamReport.isLoading ? <div className="h-16 animate-pulse rounded-xl bg-muted/60" /> : incomeStreamReport.isError ? <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">We couldn’t load this income-source plan. Refresh to try again.</p> : memberStreams.length === 0 ? <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">No income source has been set for {member.name} yet.</p> : <>
                        <div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg bg-muted p-2"><p className="text-muted-foreground">Expected</p><p className="mt-1 font-bold">{formatKes(expectedFromSources)}</p></div><div className="rounded-lg bg-muted p-2"><p className="text-muted-foreground">Recorded</p><p className="mt-1 font-bold text-primary">{formatKes(recordedForMember)}</p></div><div className="rounded-lg bg-muted p-2"><p className="text-muted-foreground">{remainingForMember < 0 ? "Above" : "Remaining"}</p><p className="mt-1 font-bold">{formatKes(Math.abs(remainingForMember))}</p></div></div>
                        <div className="divide-y divide-border/60 rounded-xl border border-border/70 px-3">{memberStreams.map((stream) => { const aboveExpected = stream.remainingBalance < 0; return <div key={stream.incomeSourceId ?? stream.sourceName} className="flex items-start justify-between gap-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-semibold">{stream.sourceName}</p><p className="mt-0.5 text-xs text-muted-foreground">Expected {formatKes(stream.expectedMonthlyAmount)} · Recorded {formatKes(stream.total)}</p></div><p className={`shrink-0 text-xs font-semibold ${aboveExpected ? "text-primary" : "text-muted-foreground"}`}>{aboveExpected ? `${formatKes(Math.abs(stream.remainingBalance))} above` : `${formatKes(stream.remainingBalance)} left`}</p></div>; })}</div>
                      </>}
                    </div>
                  </CardContent></Card>
                  );
                })}
              </div>
              {unattributedFunding && <Card className="border-amber-500/30 bg-amber-500/5"><CardContent className="pt-5"><p className="font-semibold">Unattributed funding: {formatKes(unattributedFunding.total)}</p><p className="mt-1 text-sm text-muted-foreground">No income source was selected, so this funding is kept separate from each member’s income plan.</p></CardContent></Card>}
            </div>
          )}
          {sharedHouseholdActivity.length > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/5"><CardContent className="pt-5">
              <p className="font-semibold">Shared group funding</p>
              <p className="mt-1 text-sm text-muted-foreground">These Joint bank portions are shared group funds, not member contributions, so they are excluded from the totals above.</p>
              <div className="mt-3 divide-y divide-border/60">
                {sharedHouseholdActivity.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0"><p className="break-words font-medium">{item.description}</p><p className="text-xs text-muted-foreground">{formatDate(item.date)} · Joint bank</p></div>
                    <p className="shrink-0 font-semibold">{formatKes(item.amount)}</p>
                  </div>
                ))}
              </div>
            </CardContent></Card>
          )}
        </>
      )}

      <Card className="border-none shadow-md overflow-hidden min-h-[30vh]">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-20 flex justify-center">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
          ) : activityError ? (
            <div className="p-12 text-center"><p className="font-semibold">We couldn’t load activity right now.</p><p className="mt-1 text-sm text-muted-foreground">Refresh the page to try again.</p></div>
          ) : filteredActivity.length === 0 ? (
            <div className="p-20 text-center text-muted-foreground">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <ActivityIcon className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <p className="text-lg font-medium text-foreground">No {tab === "all" ? "activity" : tab} recorded yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {dailyActivityGroups.map((group) => (
                <section key={group.date} aria-label={`Activity for ${formatDate(group.date)}`}>
                  <div className="flex items-center justify-between gap-3 bg-muted/50 px-3 py-2 sm:px-6">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{formatDate(group.date)}</p>
                    <span className="text-xs text-muted-foreground">{group.items.length} {group.items.length === 1 ? "entry" : "entries"}</span>
                  </div>
                  <div className="divide-y divide-border/50">
                    {group.items.map((item) => {
                      const canEdit = item.type === ACTIVITY_TYPE.EXPENSE && /^expense-\d+$/.test(item.id);
                      return (
                        <div key={item.id} className="flex items-start gap-3 p-3 transition-colors hover:bg-muted/10 sm:items-center sm:gap-5 sm:p-6">
                          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                            item.type === ACTIVITY_TYPE.EXPENSE ? 'bg-accent/50 text-accent-foreground border border-accent/20' : 'bg-primary/10 text-primary border border-primary/20'
                          }`}>
                            {item.type === ACTIVITY_TYPE.EXPENSE ? <ArrowDownRight className="w-5 h-5 sm:w-6 sm:h-6" /> : <ArrowUpRight className="w-5 h-5 sm:w-6 sm:h-6" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                              <p className="break-words text-sm font-semibold leading-tight text-foreground sm:text-base">{item.description}</p>
                              <span className={`shrink-0 whitespace-nowrap font-display text-base font-bold sm:text-lg ${
                                item.type === ACTIVITY_TYPE.EXPENSE ? 'text-foreground' : 'text-primary'
                              }`}>
                                {item.type === ACTIVITY_TYPE.EXPENSE ? '-' : '+'}{formatKes(item.amount)}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground sm:text-sm">
                              <span className="font-medium text-foreground/70">{item.userName}</span>
                              {item.category && (
                                <span className="px-1.5 py-0.5 bg-secondary/10 text-secondary-foreground rounded text-xs border border-secondary/20">
                                  {item.category}
                                </span>
                              )}
                            </div>
                            {canEdit && (
                              <a
                                href={expenseEditHref(item.date, item.id)}
                                className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit expense
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}