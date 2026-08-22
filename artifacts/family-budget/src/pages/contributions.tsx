import { useState, useEffect, useMemo } from "react";
import {
  useGetDashboardSummary,
  useGetDashboardIncomeStreams,
  useGetGroup,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatKes, formatMonthYear } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Calendar, TrendingUp } from "lucide-react";

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
const MEMBER_ACCENT_COLORS = ["#4ade80", "#f97316", "#38bdf8", "#f472b6", "#a78bfa"];

const CONTRIBUTIONS_MONTH_KEY = "contributions-month-pref";

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  return (
    <div className="h-2 rounded-full bg-muted overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct * 100}%`, backgroundColor: color }} />
    </div>
  );
}

function MemberCard({
  member, accentColor, incomeStreams, isIncomeStreamsLoading, incomeStreamsError,
}: {
  member: MemberContrib;
  accentColor: string;
  incomeStreams: IncomeStream[];
  isIncomeStreamsLoading: boolean;
  incomeStreamsError: boolean;
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
            <p className={`font-display font-bold text-sm ${net >= 0 ? "text-green-600" : "text-destructive"}`}>
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
      </CardContent>
    </Card>
  );
}

export default function Contributions() {
  const { data: group } = useGetGroup();
  const isSharedWorkspace = group?.isPrivate === false;
  const now = new Date();
  const [month, setMonth] = useState(() => {
    try {
      const raw = localStorage.getItem(CONTRIBUTIONS_MONTH_KEY);
      if (raw) { const p = JSON.parse(raw); if (typeof p?.month === "number") return p.month; }
    } catch {}
    return now.getMonth() + 1;
  });
  const [year, setYear] = useState(() => {
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

  const handlePrevMonth = () => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); };
  const handleNextMonth = () => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); };

  const memberContribs = ((summary as any)?.memberContributions ?? []) as MemberContrib[];
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
              <ProgressBar value={totalContrib} max={totalTarget} color="#6366f1" />
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
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
