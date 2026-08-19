import { useMemo, useState } from "react";
import { getGetDashboardActivityQueryKey, getGetDashboardSummaryQueryKey, useGetDashboardActivity, useGetDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatKes, formatDate, formatMonthYear } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Loader2, Activity as ActivityIcon, Calendar, TrendingUp } from "lucide-react";
import { ACTIVITY_TYPE } from "@/lib/activityTypes";

type ActivityTab = "all" | "expenses" | "contributions";
type MemberContribution = { userId: string; name: string; contributed: number; spent: number; net: number; target: number | null };

export default function Activity() {
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
  const activity = tab === "contributions" ? monthlyActivity.data : recentActivity.data;
  const isLoading = tab === "contributions" ? monthlyActivity.isLoading : recentActivity.isLoading;
  const activityError = tab === "contributions" ? monthlyActivity.isError : recentActivity.isError;
  const filteredActivity = useMemo(() => (activity ?? []).filter((item) => {
    if (tab === "expenses" && item.type !== ACTIVITY_TYPE.EXPENSE) return false;
    if (tab === "contributions" && item.type !== ACTIVITY_TYPE.CONTRIBUTION) return false;
    return true;
  }), [activity, tab]);
  const sharedHouseholdActivity = useMemo(
    () => tab === "contributions" ? (activity ?? []).filter((item) => item.type === "household") : [],
    [activity, tab],
  );
  const members = ((summary as { memberContributions?: MemberContribution[] } | undefined)?.memberContributions ?? []);
  const totalContributed = members.reduce((total, member) => total + member.contributed, 0);
  const totalTarget = members.reduce((total, member) => total + (member.target ?? 0), 0);
  const previousMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1);
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Activity</h1>
          <p className="text-muted-foreground mt-1">Expenses, contributions, and shared group movements in one place.</p>
        </div>
        {tab === "contributions" && (
          <div className="flex items-center gap-2 rounded-xl border bg-card p-1 shadow-sm">
            <button aria-label="Previous month" onClick={previousMonth} className="h-9 w-9 rounded-lg hover:bg-muted">←</button>
            <span className="flex items-center gap-1.5 px-2 text-sm font-semibold"><Calendar className="h-4 w-4 text-primary" />{formatMonthYear(month, year)}</span>
            <button aria-label="Next month" onClick={nextMonth} disabled={month === now.getMonth() + 1 && year === now.getFullYear()} className="h-9 w-9 rounded-lg hover:bg-muted disabled:opacity-40">→</button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 rounded-xl bg-muted p-1 text-sm font-semibold">
        {([
          ["all", "All activity"],
          ["expenses", "Expenses"],
          ["contributions", "Contributions"],
        ] as const).map(([value, label]) => (
          <button key={value} onClick={() => setTab(value)}
            className={`rounded-lg px-3 py-2.5 transition-colors ${tab === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {label}
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
                <div className="mt-2 flex items-end gap-2"><p className="text-3xl font-display font-bold">{formatKes(totalContributed)}</p><span className="mb-1 text-sm text-muted-foreground">of {formatKes(totalTarget)} target</span></div>
              </CardContent></Card>
              <div className="grid gap-4 md:grid-cols-2">
                {members.map((member) => (
                  <Card key={member.userId} className="border-none shadow-md"><CardContent className="space-y-3 pt-5">
                    <div className="flex items-start justify-between"><div><p className="font-display text-lg font-bold">{member.name}</p><p className="text-xs text-muted-foreground">{member.target == null ? "No monthly target" : `${formatKes(member.target)} monthly target`}</p></div><p className="font-display text-xl font-bold text-primary">{formatKes(member.contributed)}</p></div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg bg-muted p-2"><p className="text-muted-foreground">Contributed</p><p className="mt-1 font-bold">{formatKes(member.contributed)}</p></div><div className="rounded-lg bg-muted p-2"><p className="text-muted-foreground">Spent</p><p className="mt-1 font-bold">{formatKes(member.spent)}</p></div><div className="rounded-lg bg-muted p-2"><p className="text-muted-foreground">Net</p><p className={`mt-1 font-bold ${member.net >= 0 ? "text-primary" : "text-destructive"}`}>{member.net >= 0 ? "+" : ""}{formatKes(member.net)}</p></div></div>
                  </CardContent></Card>
                ))}
              </div>
            </div>
          )}
          {sharedHouseholdActivity.length > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/5"><CardContent className="pt-5">
              <p className="font-semibold">Shared group funding</p>
              <p className="mt-1 text-sm text-muted-foreground">These Joint bank portions are shared group funds, not member contributions, so they are excluded from the totals above.</p>
              <div className="mt-3 divide-y divide-border/60">
                {sharedHouseholdActivity.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                    <div><p className="font-medium">{item.description}</p><p className="text-xs text-muted-foreground">{formatDate(item.date)} · Joint bank</p></div>
                    <p className="font-semibold">{formatKes(item.amount)}</p>
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
              {filteredActivity.map((item) => (
                <div key={item.id} className="p-4 sm:p-6 flex items-start sm:items-center gap-3 sm:gap-5 hover:bg-muted/10 transition-colors">
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                    item.type === ACTIVITY_TYPE.EXPENSE ? 'bg-accent/50 text-accent-foreground border border-accent/20' : 'bg-primary/10 text-primary border border-primary/20'
                  }`}>
                    {item.type === ACTIVITY_TYPE.EXPENSE ? <ArrowDownRight className="w-5 h-5 sm:w-6 sm:h-6" /> : <ArrowUpRight className="w-5 h-5 sm:w-6 sm:h-6" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-foreground text-sm sm:text-base leading-tight truncate">{item.description}</p>
                      <span className={`font-display font-bold text-base sm:text-lg whitespace-nowrap shrink-0 ${
                        item.type === ACTIVITY_TYPE.EXPENSE ? 'text-foreground' : 'text-primary'
                      }`}>
                        {item.type === ACTIVITY_TYPE.EXPENSE ? '-' : '+'}{formatKes(item.amount)}
                      </span>
                    </div>
                    <div className="text-xs sm:text-sm text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                      <span className="font-medium text-foreground/70">{item.userName}</span>
                      <span className="w-1 h-1 rounded-full bg-border"></span>
                      <span>{formatDate(item.date)}</span>
                      {item.category && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-border hidden sm:inline-block"></span>
                          <span className="px-1.5 py-0.5 bg-secondary/10 text-secondary-foreground rounded text-xs border border-secondary/20">
                            {item.category}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}