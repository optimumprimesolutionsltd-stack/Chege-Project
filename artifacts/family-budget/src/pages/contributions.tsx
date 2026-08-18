import { useState, useEffect } from "react";
import {
  useGetDashboardSummary,
  getGetDashboardSummaryQueryKey,
  type IncomeSource,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatKes, formatMonthYear } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Calendar, TrendingUp } from "lucide-react";

const CHEGE_ID = "63497598";
const LYDIAH_ID = "63570605";

const MEMBER_TARGETS: Record<string, number> = {
  [CHEGE_ID]: 267094,
  [LYDIAH_ID]: 50000,
};

const MEMBER_NAMES: Record<string, string> = {
  [CHEGE_ID]: "Chege",
  [LYDIAH_ID]: "Lydiah",
};

const CONTRIBUTIONS_MONTH_KEY = "contributions-month-pref";

function useIncomeSources(userId?: string) {
  return useQuery<IncomeSource[]>({
    queryKey: ["income-sources", userId ?? "all"],
    queryFn: async () => {
      const url = userId ? `/api/income-sources?userId=${userId}` : "/api/income-sources";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });
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
  userId, contributed, spent, net,
}: { userId: string; contributed: number; spent: number; net: number }) {
  const target = MEMBER_TARGETS[userId] ?? 0;
  const name = MEMBER_NAMES[userId] ?? "Member";
  const pct = target > 0 ? Math.min((contributed / target) * 100, 100) : 0;
  const isChege = userId === CHEGE_ID;
  const accentColor = isChege ? "#4ade80" : "#f97316";
  const { data: sources } = useIncomeSources(userId);

  return (
    <Card className="border-none shadow-md overflow-hidden">
      <div className="h-1" style={{ backgroundColor: accentColor }} />
      <CardContent className="pt-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xl font-display font-bold text-foreground">{name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Target: {formatKes(target)}/month</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-display font-bold" style={{ color: accentColor }}>
              {formatKes(contributed)}
            </p>
            <p className="text-xs text-muted-foreground">contributed</p>
          </div>
        </div>

        {/* Progress */}
        <ProgressBar value={contributed} max={target} color={accentColor} />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{Math.round(pct)}% of target</span>
          {contributed < target
            ? <span>{formatKes(target - contributed)} remaining</span>
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

        {/* Income sources */}
        {sources && sources.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Income streams</p>
            <div className="flex flex-wrap gap-1.5">
              {sources.map(src => (
                <span key={src.id}
                  className="px-2.5 py-1 rounded-full text-xs border font-medium"
                  style={{ borderColor: accentColor + "60", color: accentColor, backgroundColor: accentColor + "12" }}>
                  {src.name}{src.isMain ? " ★" : ""}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Contributions() {
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

  const handlePrevMonth = () => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); };
  const handleNextMonth = () => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); };

  const totalContrib = (summary?.chegeContributed ?? 0) + (summary?.lydiahContributed ?? 0);
  const totalTarget = Object.values(MEMBER_TARGETS).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Contributions</h1>
          <p className="text-muted-foreground mt-1">Automatic — from deposits and direct payments.</p>
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
            Every expense and bank deposit counts automatically. Tag an income source when logging to track which stream the money came from.
          </p>
        </div>
      </div>

      {/* Combined total */}
      {summary && (
        <Card className="border-none shadow-md">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Household total</p>
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
          </CardContent>
        </Card>
      )}

      {/* Per-person cards */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : summary ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MemberCard
            userId={CHEGE_ID}
            contributed={summary.chegeContributed}
            spent={summary.chegeSpent}
            net={summary.chegeNet}
          />
          <MemberCard
            userId={LYDIAH_ID}
            contributed={summary.lydiahContributed}
            spent={summary.lydiahSpent}
            net={summary.lydiahNet}
          />
        </div>
      ) : null}
    </div>
  );
}
