import { useMemo, useState } from "react";
import {
  getDashboardMonthlyReportPdf,
  getGetDashboardIncomeStreamsQueryKey,
  getGetDashboardPeriodTotalsQueryKey,
  useGetDashboardIncomeStreams,
  useGetDashboardPeriodTotals,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { dateInputValue, getPeriodRange, type PeriodView } from "@/lib/period-range";
import { formatKes, formatDate, formatMonthYear } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Calendar, CheckCircle2, ChevronDown, ChevronUp, CircleHelp, Download, Landmark, Loader2, PiggyBank, TrendingDown, TrendingUp, WalletCards } from "lucide-react";

function fundingEntryLabel(recordType: "expense" | "deposit" | "savings") {
  if (recordType === "deposit") return "Joint bank deposit";
  if (recordType === "savings") return "Savings addition";
  return "Personal expense";
}

function displayPeriodDate(value: string): string {
  return new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(`${value}T12:00:00`));
}

function displayPeriodRange(startDate: string, endDate: string): string {
  if (startDate === endDate) return displayPeriodDate(startDate);
  return `${displayPeriodDate(startDate)} – ${displayPeriodDate(endDate)}`;
}

export default function IncomeStreamsReport() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const today = dateInputValue(now);
  const [periodView, setPeriodView] = useState<PeriodView>("month");
  const [anchorDate, setAnchorDate] = useState(today);
  const [customStartDate, setCustomStartDate] = useState(() => dateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [customEndDate, setCustomEndDate] = useState(today);
  const [expandedStreamId, setExpandedStreamId] = useState<number | "unattributed" | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const { data: report, isLoading, isError, refetch } = useGetDashboardIncomeStreams(
    { month, year },
    { query: { queryKey: getGetDashboardIncomeStreamsQueryKey({ month, year }), retry: false }, request: { cache: "no-store" } },
  );
  const periodRange = useMemo(
    () => getPeriodRange({ view: periodView, anchorDate, month, year, customStartDate, customEndDate }),
    [anchorDate, customEndDate, customStartDate, month, periodView, year],
  );
  const hasInvalidRange = periodRange.startDate > periodRange.endDate;
  const periodTotals = useGetDashboardPeriodTotals(
    hasInvalidRange
      ? { startDate: today, endDate: today }
      : periodRange,
    {
      query: {
        queryKey: getGetDashboardPeriodTotalsQueryKey(hasInvalidRange ? { startDate: today, endDate: today } : periodRange),
        retry: false,
        enabled: !hasInvalidRange,
      },
      request: { cache: "no-store" },
    },
  );

  const previousMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };
  const nextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };
  const currentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
  const downloadPdf = async () => {
    setIsDownloading(true);
    setDownloadMessage(null);
    try {
      const reportPdf = await getDashboardMonthlyReportPdf({ month, year }, { responseType: "blob", cache: "no-store" });
      const href = URL.createObjectURL(reportPdf);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `bajeti-monthly-report-${year}-${String(month).padStart(2, "0")}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
      setDownloadMessage("Your monthly PDF has downloaded.");
    } catch {
      setDownloadMessage("We couldn’t create the PDF. Check your group access and try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 sm:space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Reports</p>
          <h1 className="mt-1 text-2xl font-display font-bold text-foreground sm:text-3xl">Activity totals</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Review your money by day, week, month, or a custom range. Monthly income-stream detail remains below.
          </p>
        </div>
          <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
          <div className="flex w-full items-center justify-between gap-1 rounded-xl border bg-card p-1 shadow-sm sm:w-auto">
            <Button variant="ghost" size="icon" onClick={previousMonth} className="h-10 w-10 rounded-lg hover:bg-muted" aria-label="Previous month">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1 text-center text-sm font-semibold sm:flex-none sm:px-2">
              <Calendar className="h-4 w-4 text-primary" />
              {formatMonthYear(month, year)}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={nextMonth}
              disabled={currentMonth}
              className="h-10 w-10 rounded-lg hover:bg-muted"
              aria-label="Next month"
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
          <Button
            onClick={downloadPdf}
            disabled={isLoading || isDownloading}
            className="h-10 w-full gap-2 rounded-xl sm:w-auto"
          >
            {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {isDownloading ? "Creating PDF" : "Monthly PDF"}
          </Button>
        </div>
      </div>
      {downloadMessage && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${downloadMessage.startsWith("Your") ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
          {downloadMessage.startsWith("Your") ? <CheckCircle2 className="h-4 w-4" /> : <CircleHelp className="h-4 w-4" />}
          {downloadMessage}
        </div>
      )}

      <Card className="overflow-hidden border-none shadow-md" data-testid="period-totals-report">
        <div className="h-1 bg-primary" />
        <CardContent className="space-y-5 p-4 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-display text-xl font-bold">Period totals</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasInvalidRange ? "Choose an end date on or after the start date." : displayPeriodRange(periodRange.startDate, periodRange.endDate)}
              </p>
            </div>
            <div className="grid w-full grid-cols-2 gap-1 rounded-xl bg-muted p-1 text-sm font-semibold sm:flex sm:w-auto">
              {([
                ["day", "Day"],
                ["week", "Week"],
                ["month", "Month"],
                ["custom", "Custom"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={periodView === value}
                  data-testid={`period-mode-${value}`}
                  onClick={() => setPeriodView(value)}
                 className={`min-w-0 rounded-lg px-2 py-2 transition-colors sm:px-3 ${periodView === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {periodView === "month" ? (
            <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
              This uses the month selected above: <span className="font-semibold text-foreground">{formatMonthYear(month, year)}</span>.
            </div>
          ) : periodView === "custom" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                Start date
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(event) => setCustomStartDate(event.target.value)}
                  className="h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                End date
                <input
                  type="date"
                  min={customStartDate}
                  value={customEndDate}
                  onChange={(event) => setCustomEndDate(event.target.value)}
                  className="h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                />
              </label>
            </div>
          ) : (
            <label className="grid max-w-sm gap-1.5 text-sm font-medium text-foreground">
              {periodView === "day" ? "Date" : "Any date in the week"}
              <input
                type="date"
                value={anchorDate}
                onChange={(event) => setAnchorDate(event.target.value)}
                className="h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
              />
            </label>
          )}

          {hasInvalidRange ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              The end date must be the same as or later than the start date.
            </div>
          ) : periodTotals.isLoading ? (
            <div className="flex min-h-44 items-center justify-center rounded-xl bg-muted/40">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : periodTotals.isError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-4 text-sm">
              <p className="font-semibold text-foreground">We couldn’t load these period totals.</p>
              <p className="mt-1 text-muted-foreground">Check your connection and try again.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => periodTotals.refetch()}>Try again</Button>
            </div>
          ) : periodTotals.data ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border/60 bg-card p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total spending</p>
                  <p className="mt-2 font-display text-2xl font-bold">{formatKes(periodTotals.data.spendingTotal)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{periodTotals.data.expenseCount} {periodTotals.data.expenseCount === 1 ? "expense" : "expenses"}</p>
                </div>
                <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Total funding</p>
                  <p className="mt-2 font-display text-2xl font-bold text-primary">{formatKes(periodTotals.data.contributionTotal)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Money recorded for the group</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-card p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Net movement</p>
                  <p className={`mt-2 font-display text-2xl font-bold ${periodTotals.data.netMovement < 0 ? "text-destructive" : "text-primary"}`}>
                    {periodTotals.data.netMovement >= 0 ? "+" : ""}{formatKes(periodTotals.data.netMovement)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Funding less spending</p>
                </div>
              </div>

               <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
                <div className="rounded-xl bg-muted/50 p-3">
                  <Landmark className="h-4 w-4 text-primary" />
                  <p className="mt-2 text-xs text-muted-foreground">Bank deposits</p>
                  <p className="mt-1 font-display text-lg font-bold">{formatKes(periodTotals.data.bankDepositTotal)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{periodTotals.data.bankDepositCount} {periodTotals.data.bankDepositCount === 1 ? "deposit" : "deposits"}</p>
                </div>
                <div className="rounded-xl bg-muted/50 p-3">
                  <TrendingDown className="h-4 w-4 text-destructive" />
                  <p className="mt-2 text-xs text-muted-foreground">Bank disbursed</p>
                  <p className="mt-1 font-display text-lg font-bold">{formatKes(periodTotals.data.bankDisbursementTotal)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{periodTotals.data.bankDisbursementCount} {periodTotals.data.bankDisbursementCount === 1 ? "withdrawal" : "withdrawals"}</p>
                </div>
                <div className="rounded-xl bg-muted/50 p-3">
                  <PiggyBank className="h-4 w-4 text-primary" />
                  <p className="mt-2 text-xs text-muted-foreground">Goal savings</p>
                  <p className="mt-1 font-display text-lg font-bold">{formatKes(periodTotals.data.savingsTotal)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{periodTotals.data.savingsCount} {periodTotals.data.savingsCount === 1 ? "addition" : "additions"}</p>
                </div>
                <div className="rounded-xl bg-muted/50 p-3">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <p className="mt-2 text-xs text-muted-foreground">Recorded expenses</p>
                  <p className="mt-1 font-display text-lg font-bold">{formatKes(periodTotals.data.expenseTotal)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Before standalone bank costs</p>
                </div>
              </div>

              <p className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                Funding counts personal expense portions, qualifying bank deposits, and savings additions once. Linked Joint bank withdrawals are shown as bank activity but are not added to spending twice.
              </p>
              {periodTotals.data.expenseCount + periodTotals.data.bankDepositCount + periodTotals.data.bankDisbursementCount + periodTotals.data.savingsCount === 0 && (
                <p className="rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground">No activity was recorded for this period.</p>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-semibold">Monthly income-stream detail</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            It combines personal portions of expenses, shared-bank deposits, and personal savings additions.
            Joint-bank expense portions are excluded because the money was already counted when it was deposited.
            Money saved without a selected stream is shown as Unattributed.
          </p>
        </div>
      </div>

      {isLoading ? (
        <Card className="border-none shadow-md">
          <CardContent className="flex min-h-56 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      ) : isError ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-8 text-center">
            <p className="font-semibold">We couldn’t load this income report.</p>
            <p className="mt-1 text-sm text-muted-foreground">Check your group access, then try again.</p>
            <Button variant="outline" className="mt-4" onClick={() => refetch()}>Try again</Button>
          </CardContent>
        </Card>
      ) : report ? (
        <>
          <Card className="overflow-hidden border-none shadow-md">
            <div className="h-1 bg-primary" />
              <CardContent className="grid grid-cols-3 gap-3 pt-5">
              <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expected income</p>
                  <p className="mt-2 font-display text-3xl font-bold">{formatKes(report.totalExpected)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recorded funding</p>
                <p className="mt-2 font-display text-3xl font-bold">{formatKes(report.totalFunding)}</p>
              </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{report.remainingBalance < 0 ? "Above expected" : "Still expected"}</p>
                  <p className={`mt-2 font-display text-3xl font-bold ${report.remainingBalance < 0 ? "text-primary" : "text-foreground"}`}>{formatKes(Math.abs(report.remainingBalance))}</p>
                </div>
            </CardContent>
          </Card>

          {report.streams.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
                <WalletCards className="h-10 w-10 text-muted-foreground/50" />
                <p className="mt-4 font-semibold">No funding has been recorded for this month.</p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Record an expense, bank deposit, or savings contribution, then choose an income stream when one applies.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {report.streams.map((stream) => {
                const unattributed = stream.incomeSourceId == null;
                const streamId = stream.incomeSourceId ?? "unattributed";
                const isExpanded = expandedStreamId === streamId;
                return (
                  <Card key={streamId} className={`overflow-hidden transition-shadow ${unattributed ? "border-amber-500/30 bg-amber-500/5" : "border-none shadow-sm"} ${isExpanded ? "shadow-md" : "hover:shadow-md"}`}>
                    <CardContent className="space-y-4 pt-5">
                      <button
                        type="button"
                        className="w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        onClick={() => setExpandedStreamId(isExpanded ? null : streamId)}
                        aria-expanded={isExpanded}
                        aria-controls={`income-stream-${streamId}-activity`}
                        data-testid={`income-stream-${streamId}-toggle`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className={`mt-0.5 rounded-xl p-2.5 ${unattributed ? "bg-amber-500/15 text-amber-700" : "bg-primary/10 text-primary"}`}>
                              {unattributed ? <CircleHelp className="h-5 w-5" /> : <WalletCards className="h-5 w-5" />}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-display text-lg font-bold">{stream.sourceName}</p>
                              <p className="mt-0.5 text-sm text-muted-foreground">{stream.ownerName}</p>
                            </div>
                          </div>
                          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
                            <p className="break-words font-display text-xl font-bold">{formatKes(stream.total)}</p>
                            {isExpanded ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                          </div>
                        </div>
                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className={unattributed ? "h-full rounded-full bg-amber-500" : "h-full rounded-full bg-primary"}
                            style={{ width: `${Math.min(stream.sharePercent, 100)}%` }}
                          />
                        </div>
                        <div className="mt-2 flex flex-col items-start gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                          <span className="min-w-0 break-words">Expected {formatKes(stream.expectedMonthlyAmount)} · {stream.remainingBalance < 0 ? `${formatKes(Math.abs(stream.remainingBalance))} above` : `${formatKes(stream.remainingBalance)} remaining`}</span>
                          <span className="shrink-0">{stream.transactionCount} {stream.transactionCount === 1 ? "record" : "records"}</span>
                        </div>
                      </button>
                      {isExpanded && (
                        <div id={`income-stream-${streamId}-activity`} className="border-t border-border/60 pt-4">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                            <div>
                              <p className="text-sm font-semibold">Activity in this stream</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">{formatMonthYear(month, year)} funding records</p>
                            </div>
                            <span className="shrink-0 text-xs font-semibold text-muted-foreground">{stream.transactionCount} {stream.transactionCount === 1 ? "record" : "records"}</span>
                          </div>
                          {stream.entries.length === 0 ? (
                            <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">No activity was recorded for this stream in this month.</p>
                          ) : (
                            <div className="mt-3 divide-y divide-border/60 rounded-xl border border-border/70 px-3">
                              {stream.entries.map((entry) => (
                                <div key={`${entry.recordType}-${entry.recordId}`} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                                  <div className="min-w-0">
                                    <p className="break-words font-medium">{entry.description}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{fundingEntryLabel(entry.recordType)} · {formatDate(entry.date)}</p>
                                  </div>
                                  <p className="font-semibold sm:shrink-0">{formatKes(entry.amount)}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}