import { useState } from "react";
import {
  getDashboardMonthlyReportPdf,
  getGetDashboardIncomeStreamsQueryKey,
  useGetDashboardIncomeStreams,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatKes, formatMonthYear } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Calendar, CheckCircle2, CircleHelp, Download, Loader2, TrendingUp, WalletCards } from "lucide-react";

export default function IncomeStreamsReport() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const { data: report, isLoading, isError, refetch } = useGetDashboardIncomeStreams(
    { month, year },
    { query: { queryKey: getGetDashboardIncomeStreamsQueryKey({ month, year }), retry: false }, request: { cache: "no-store" } },
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
    <div className="space-y-7 pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Funding report</p>
          <h1 className="mt-1 text-3xl font-display font-bold text-foreground">Income streams</h1>
          <p className="mt-1 text-muted-foreground">
            Compare expected monthly income with the funding your group has recorded.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-1 rounded-xl border bg-card p-1 shadow-sm">
            <Button variant="ghost" size="icon" onClick={previousMonth} className="h-10 w-10 rounded-lg hover:bg-muted" aria-label="Previous month">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-1.5 px-2 text-sm font-semibold">
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
            className="h-10 gap-2 rounded-xl"
          >
            {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {isDownloading ? "Creating PDF" : "Download PDF"}
          </Button>
        </div>
      </div>
      {downloadMessage && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${downloadMessage.startsWith("Your") ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
          {downloadMessage.startsWith("Your") ? <CheckCircle2 className="h-4 w-4" /> : <CircleHelp className="h-4 w-4" />}
          {downloadMessage}
        </div>
      )}

      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-semibold">How this report works</p>
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
              <CardContent className="grid grid-cols-1 gap-4 pt-5 sm:grid-cols-3">
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
                return (
                  <Card key={stream.incomeSourceId ?? "unattributed"} className={unattributed ? "border-amber-500/30 bg-amber-500/5" : "border-none shadow-sm"}>
                    <CardContent className="space-y-4 pt-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className={`mt-0.5 rounded-xl p-2.5 ${unattributed ? "bg-amber-500/15 text-amber-700" : "bg-primary/10 text-primary"}`}>
                            {unattributed ? <CircleHelp className="h-5 w-5" /> : <WalletCards className="h-5 w-5" />}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-display text-lg font-bold">{stream.sourceName}</p>
                            <p className="mt-0.5 text-sm text-muted-foreground">{stream.ownerName}</p>
                          </div>
                        </div>
                        <p className="shrink-0 font-display text-xl font-bold">{formatKes(stream.total)}</p>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className={unattributed ? "h-full rounded-full bg-amber-500" : "h-full rounded-full bg-primary"}
                          style={{ width: `${Math.min(stream.sharePercent, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between gap-4 text-xs text-muted-foreground">
                        <span>Expected {formatKes(stream.expectedMonthlyAmount)} · {stream.remainingBalance < 0 ? `${formatKes(Math.abs(stream.remainingBalance))} above` : `${formatKes(stream.remainingBalance)} remaining`}</span>
                        <span>{stream.transactionCount} {stream.transactionCount === 1 ? "record" : "records"}</span>
                      </div>
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