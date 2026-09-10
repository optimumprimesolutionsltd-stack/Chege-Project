import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Eye, EyeOff, Loader2 } from "lucide-react";
import { formatKes } from "@/lib/utils";

// WhatsApp's own mark, so the share button reads as "send to WhatsApp" rather
// than a generic message. lucide dropped brand glyphs, so it is inlined.
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.045zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.5-.669-.51a12.6 12.6 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" />
    </svg>
  );
}
import { useToast } from "@/hooks/use-toast";
import {
  buildContributionWhatsAppText,
  buildGroupContributionReportHtml,
  buildMemberContributionReportHtml,
  buildStatementWhatsAppText,
  type StatementShare,
} from "@/lib/contribution-report";
import type { ContributionGrid } from "@/components/contributions-grid";

export type MonthOption = { key: string; label: string };

export type DownloadMode = "grid" | "ledger";

// The last 12 months, newest first — the window /api/contributions/grid can
// return in one call.
export function contributionMonthOptions(): MonthOption[] {
  const now = new Date();
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const month = date.getMonth() + 1;
    return {
      key: `${date.getFullYear()}-${String(month).padStart(2, "0")}`,
      label: date.toLocaleString("en-KE", { month: "short", year: "numeric" }),
    };
  });
}

/** Today as YYYY-MM-DD, local time — the default "to" for the dated ledger. */
export function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** The first of the current month, YYYY-MM-DD — the default "from". */
export function monthStartKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

/** The earliest day the dated ledger can reach: the server only loads 12
 *  months of history for a statement. */
export function ledgerFloorKey(): string {
  const now = new Date();
  const floor = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  return `${floor.getFullYear()}-${String(floor.getMonth() + 1).padStart(2, "0")}-01`;
}

// Opened synchronously with the click so pop-up blockers allow it; filled in
// once the data is ready.
function openPreparingWindow(): Window | null {
  const win = window.open("", "_blank");
  if (win) {
    win.document.write(
      "<!doctype html><title>Preparing…</title><body style=\"font:14px system-ui;margin:32px\">Preparing the report…",
    );
  }
  return win;
}

function writeReport(win: Window, html: string): void {
  win.document.open();
  win.document.write(html);
  win.document.close();
}

async function fetchGrid(): Promise<ContributionGrid> {
  const response = await fetch("/api/contributions/grid?months=12", { credentials: "include" });
  if (!response.ok) throw new Error("grid request failed");
  return (await response.json()) as ContributionGrid;
}

type StatementResponse = {
  periodLabel: string;
  contributors: Array<{ id: number; name: string }>;
  entries: Array<{ contributorId: number; contributorName: string; date: string; amount: number; source: "recorded" | "deposit" }>;
  totalsByContributor: Record<number, number>;
  grandTotal: number;
};

async function fetchStatementShare(budgetName: string, from: string, to: string): Promise<StatementShare> {
  const response = await fetch(
    `/api/contributions/statement?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { credentials: "include" },
  );
  if (!response.ok) throw new Error("statement request failed");
  const data = (await response.json()) as StatementResponse;
  return {
    budgetName,
    periodLabel: data.periodLabel,
    entries: data.entries.map((entry) => ({
      date: entry.date,
      name: entry.contributorName,
      amount: entry.amount,
      source: entry.source,
    })),
    perMember: data.contributors.map((row) => ({ name: row.name, total: data.totalsByContributor[row.id] ?? 0 })),
    grandTotal: data.grandTotal,
  };
}

// Indices of the grid's months that fall in [start, end], inclusive.
function keptMonths(grid: ContributionGrid, start: string, end: string): number[] {
  return grid.months
    .map((entry, index) => ({
      index,
      key: `${entry.year}-${String(entry.month).padStart(2, "0")}`,
    }))
    .filter((entry) => entry.key >= start && entry.key <= end)
    .map((entry) => entry.index);
}

function ordered(fromKey: string, toKey: string): [string, string] {
  return fromKey <= toKey ? [fromKey, toKey] : [toKey, fromKey];
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "3 Sep" — fixed table, not Intl, so it never renders "Sept" on some runtimes. */
function shortDate(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  return `${day ?? 1} ${MONTH_ABBR[(month ?? 1) - 1] ?? ""}`;
}

/** A whole-month key range as inclusive ISO dates: first of `startKey` to last of `endKey`. */
function monthKeyRangeToDates(startKey: string, endKey: string): { from: string; to: string } {
  const [year, month] = endKey.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return { from: `${startKey}-01`, to: `${endKey}-${String(lastDay).padStart(2, "0")}` };
}

/**
 * The report on screen — the same figures the PDF and the WhatsApp message
 * carry, for people who just want to read it here without sending or saving
 * anything.
 */
function StatementView({ from, to }: { from: string; to: string }) {
  const [state, setState] = useState<{ status: "loading" | "error" | "ready"; data: StatementShare | null }>({
    status: "loading",
    data: null,
  });

  useEffect(() => {
    let active = true;
    setState({ status: "loading", data: null });
    fetchStatementShare("", from, to)
      .then((data) => {
        if (active) setState({ status: "ready", data });
      })
      .catch(() => {
        if (active) setState({ status: "error", data: null });
      });
    return () => {
      active = false;
    };
  }, [from, to]);

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading the report…
      </div>
    );
  }
  if (state.status === "error" || !state.data) {
    return (
      <p className="rounded-xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
        The report could not be loaded. Try again in a moment.
      </p>
    );
  }

  const { data } = state;
  const perMember = data.perMember.filter((row) => row.total !== 0);

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4" data-testid="contribution-statement-view">
      <p className="text-sm font-semibold text-foreground">{data.periodLabel}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {data.entries.length} {data.entries.length === 1 ? "entry" : "entries"} · {formatKes(data.grandTotal)} in total
      </p>

      {data.entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nothing recorded in this range.</p>
      ) : (
        <div className="mt-3 -mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[22rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 pr-3 font-semibold">Date</th>
                <th className="py-1.5 pr-3 font-semibold">Member</th>
                <th className="py-1.5 pl-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry, index) => (
                <tr key={`${entry.date}-${index}`} className="border-b border-border/50">
                  <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums text-muted-foreground">{shortDate(entry.date)}</td>
                  <td className="max-w-[9rem] truncate py-1.5 pr-3 text-foreground">
                    {entry.name}
                    {entry.source === "deposit" ? <span className="ml-1 text-xs text-muted-foreground">bank</span> : null}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums text-foreground">
                    {formatKes(entry.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {perMember.length > 0 ? (
        <div className="mt-3 border-t border-border pt-2">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">By member</p>
          <ul className="flex flex-col gap-0.5 text-sm">
            {perMember.map((row) => (
              <li key={row.name} className="flex justify-between">
                <span className="truncate text-foreground">{row.name}</span>
                <span className="tabular-nums text-foreground">{formatKes(row.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function statementPdfUrl(from: string, to: string, userId?: string): string {
  const [start, end] = ordered(from, to);
  const params = new URLSearchParams({ from: start, to: end });
  if (userId) params.set("userId", userId);
  return `/api/contributions/statement.pdf?${params.toString()}`;
}

/** The Monthly grid / Dated ledger switch. Grid keeps the expected-versus-actual
 *  sheet by whole months; ledger lists individual dated entries between two
 *  days — the only way to see part of a month. */
function ModeToggle({ mode, onModeChange }: { mode: DownloadMode; onModeChange: (mode: DownloadMode) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border/60 bg-background p-0.5 text-xs font-medium">
      {(["grid", "ledger"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onModeChange(option)}
          className={`rounded-md px-2.5 py-1.5 transition-colors ${
            mode === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid={`contribution-download-mode-${option}`}
        >
          {option === "grid" ? "Monthly grid" : "Dated ledger"}
        </button>
      ))}
    </div>
  );
}

/**
 * Downloads the group's contribution record as a PDF, for the chosen range.
 *
 * "Monthly grid" opens a print-ready expected-versus-actual sheet the browser
 * saves as PDF — no PDF library, so it works the same on a phone and a desktop.
 * "Dated ledger" opens the server-built statement PDF for an exact day range,
 * the only way to cover part of a month. The range is controlled from the
 * parent so the per-member buttons on the same page reuse it.
 */
export function DownloadContributions({
  budgetName,
  mode,
  onModeChange,
  fromKey,
  toKey,
  onFromChange,
  onToChange,
  dayFrom,
  dayTo,
  onDayFromChange,
  onDayToChange,
}: {
  budgetName: string;
  mode: DownloadMode;
  onModeChange: (mode: DownloadMode) => void;
  fromKey: string;
  toKey: string;
  onFromChange: (key: string) => void;
  onToChange: (key: string) => void;
  dayFrom: string;
  dayTo: string;
  onDayFromChange: (key: string) => void;
  onDayToChange: (key: string) => void;
}) {
  const { toast } = useToast();
  const options = useMemo(contributionMonthOptions, []);
  const floor = useMemo(ledgerFloorKey, []);
  const today = useMemo(todayKey, []);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [start, end] = ordered(fromKey, toKey);

  // The on-screen report always reads as a dated list. In grid mode the chosen
  // month range becomes first-of-start to last-of-end.
  const viewRange =
    mode === "ledger"
      ? { from: ordered(dayFrom, dayTo)[0], to: ordered(dayFrom, dayTo)[1] }
      : monthKeyRangeToDates(start, end);

  // The grid rows narrowed to the chosen month range — shared by the grid PDF
  // and its WhatsApp text. Null when nothing falls in the range.
  const buildReport = (grid: ContributionGrid) => {
    const keep = keptMonths(grid, start, end);
    if (keep.length === 0) return null;
    const months = keep.map((index) => grid.months[index]);
    const rows = grid.rows.map((row) => {
      const amounts = keep.map((index) => row.amounts[index] ?? 0);
      return {
        name: row.name,
        monthlyTarget: row.monthlyTarget,
        amounts,
        total: amounts.reduce((sum, amount) => sum + amount, 0),
      };
    });
    return { budgetName, months, rows, grandTotal: rows.reduce((sum, row) => sum + row.total, 0) };
  };

  const download = async () => {
    if (mode === "ledger") {
      window.open(statementPdfUrl(dayFrom, dayTo), "_blank", "noopener,noreferrer");
      return;
    }

    const printWindow = openPreparingWindow();
    if (!printWindow) {
      toast({
        variant: "destructive",
        title: "Allow pop-ups to download",
        description: "The report opens in a new tab to be saved as PDF.",
      });
      return;
    }

    setBusy(true);
    try {
      const report = buildReport(await fetchGrid());
      if (!report) {
        printWindow.close();
        toast({ title: "Nothing in that range", description: "Pick a different from and to month." });
        return;
      }
      writeReport(printWindow, buildGroupContributionReportHtml(report));
    } catch {
      printWindow.close();
      toast({
        variant: "destructive",
        title: "Could not create the report",
        description: "Try again in a moment.",
      });
    } finally {
      setBusy(false);
    }
  };

  const shareToWhatsApp = async () => {
    // Opened synchronously so the redirect is not treated as a blocked pop-up
    // once the data is ready.
    const chatWindow = window.open("", "_blank");
    setSharing(true);
    try {
      // The verify link is a nicety, not a blocker — if it fails, still share.
      let verifyUrl: string | undefined;
      try {
        const response = await fetch("/api/contributions/verify-link", { credentials: "include" });
        if (response.ok) verifyUrl = ((await response.json()) as { url?: string }).url;
      } catch {
        verifyUrl = undefined;
      }

      let text: string;
      if (mode === "ledger") {
        const share = await fetchStatementShare(budgetName, dayFrom, dayTo);
        if (share.entries.length === 0) {
          chatWindow?.close();
          toast({ title: "Nothing in that range", description: "Pick a different from and to date." });
          return;
        }
        text = buildStatementWhatsAppText(share, verifyUrl);
      } else {
        const report = buildReport(await fetchGrid());
        if (!report) {
          chatWindow?.close();
          toast({ title: "Nothing in that range", description: "Pick a different from and to month." });
          return;
        }
        text = buildContributionWhatsAppText(report, verifyUrl);
      }

      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      if (chatWindow) chatWindow.location.href = url;
      else window.open(url, "_blank");
    } catch {
      chatWindow?.close();
      toast({ variant: "destructive", title: "Could not open WhatsApp", description: "Try again in a moment." });
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <ModeToggle mode={mode} onModeChange={onModeChange} />
        <p className="text-xs text-muted-foreground">
          {mode === "grid" ? "Whole months, expected vs actual" : "Any day range, entry by entry"}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {mode === "grid" ? (
          <>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-foreground">From</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={fromKey}
                onChange={(event) => onFromChange(event.target.value)}
                data-testid="select-contribution-pdf-from"
              >
                {options.map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-foreground">To</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={toKey}
                onChange={(event) => onToChange(event.target.value)}
                data-testid="select-contribution-pdf-to"
              >
                {options.map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-foreground">From</span>
              <input
                type="date"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={dayFrom}
                min={floor}
                max={dayTo || today}
                onChange={(event) => onDayFromChange(event.target.value)}
                data-testid="input-contribution-pdf-from"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-foreground">To</span>
              <input
                type="date"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={dayTo}
                min={dayFrom || floor}
                max={today}
                onChange={(event) => onDayToChange(event.target.value)}
                data-testid="input-contribution-pdf-to"
              />
            </label>
          </>
        )}
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Button
            variant="outline"
            onClick={() => setViewing((value) => !value)}
            data-testid="button-view-contributions"
          >
            {viewing ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
            {viewing ? "Hide" : "View"}
          </Button>
          <Button
            onClick={() => void shareToWhatsApp()}
            disabled={sharing || busy}
            className="bg-[#25D366] text-white hover:bg-[#1eb257]"
            data-testid="button-share-contributions-whatsapp"
          >
            {sharing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <WhatsAppIcon className="mr-1 h-4 w-4" />}
            {sharing ? "Opening…" : "WhatsApp"}
          </Button>
          <Button
            onClick={() => void download()}
            disabled={busy || sharing}
            data-testid="button-download-contributions-pdf"
          >
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
            {busy ? "Preparing…" : "Download PDF"}
          </Button>
        </div>
      </div>

      {viewing ? <StatementView from={viewRange.from} to={viewRange.to} /> : null}

      {mode === "ledger" ? (
        <p className="text-xs text-muted-foreground">
          Hand-recorded contributions are dated to the first of their month; bank deposits carry their real date.
        </p>
      ) : null}
    </div>
  );
}

/**
 * One member's contribution record as a PDF, for the same range the group
 * control is set to. In "Monthly grid" mode this is a print-ready sheet matched
 * to the grid by name; in "Dated ledger" mode it is the server statement PDF
 * for the exact day range.
 */
export function DownloadMemberContribution({
  budgetName,
  memberName,
  memberUserId,
  mode,
  fromKey,
  toKey,
  dayFrom,
  dayTo,
}: {
  budgetName: string;
  memberName: string;
  memberUserId: string;
  mode: DownloadMode;
  fromKey: string;
  toKey: string;
  dayFrom: string;
  dayTo: string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [start, end] = ordered(fromKey, toKey);

  const download = async () => {
    if (mode === "ledger") {
      window.open(statementPdfUrl(dayFrom, dayTo, memberUserId), "_blank", "noopener,noreferrer");
      return;
    }

    const printWindow = openPreparingWindow();
    if (!printWindow) {
      toast({
        variant: "destructive",
        title: "Allow pop-ups to download",
        description: "The report opens in a new tab to be saved as PDF.",
      });
      return;
    }

    setBusy(true);
    try {
      const grid = await fetchGrid();
      const keep = keptMonths(grid, start, end);
      if (keep.length === 0) {
        printWindow.close();
        toast({ title: "Nothing in that range", description: "Adjust the From and To months above." });
        return;
      }

      const row = grid.rows.find((entry) => entry.name === memberName);
      const months = keep.map((index) => grid.months[index]);
      const amounts = keep.map((index) => row?.amounts[index] ?? 0);
      const outstanding = keep.map((index) =>
        row?.monthlyTarget == null ? null : row.outstanding[index] ?? 0,
      );

      writeReport(
        printWindow,
        buildMemberContributionReportHtml({
          budgetName,
          memberName,
          months,
          amounts,
          outstanding,
          creditRemaining: row?.creditRemaining ?? 0,
          total: amounts.reduce((sum, amount) => sum + amount, 0),
        }),
      );
    } catch {
      printWindow.close();
      toast({
        variant: "destructive",
        title: "Could not create the report",
        description: "Try again in a moment.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void download()}
      disabled={busy}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline disabled:opacity-60"
      data-testid={`download-member-contribution-${memberName}`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      {busy ? "Preparing…" : mode === "ledger" ? "Download ledger (PDF)" : "Download PDF"}
    </button>
  );
}
