import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  buildGroupContributionReportHtml,
  buildMemberContributionReportHtml,
} from "@/lib/contribution-report";
import type { ContributionGrid } from "@/components/contributions-grid";

export type MonthOption = { key: string; label: string };

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

/**
 * Downloads the group's month-by-month contribution sheet as a PDF, for the
 * chosen range. Opens a print-ready page the browser saves as PDF — no PDF
 * library, which keeps it working the same on a phone (Save to Files, then
 * share to WhatsApp) and on a desktop. The From/To range is controlled so the
 * per-member buttons on the same page can reuse it.
 */
export function DownloadContributions({
  budgetName,
  fromKey,
  toKey,
  onFromChange,
  onToChange,
}: {
  budgetName: string;
  fromKey: string;
  toKey: string;
  onFromChange: (key: string) => void;
  onToChange: (key: string) => void;
}) {
  const { toast } = useToast();
  const options = useMemo(contributionMonthOptions, []);
  const [busy, setBusy] = useState(false);
  const [start, end] = ordered(fromKey, toKey);

  const download = async () => {
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
        toast({ title: "Nothing in that range", description: "Pick a different from and to month." });
        return;
      }

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
      const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);

      writeReport(printWindow, buildGroupContributionReportHtml({ budgetName, months, rows, grandTotal }));
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
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-end">
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
      <Button
        onClick={() => void download()}
        disabled={busy}
        className="sm:ml-auto"
        data-testid="button-download-contributions-pdf"
      >
        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
        {busy ? "Preparing…" : "Download PDF"}
      </Button>
    </div>
  );
}

/**
 * One member's contribution record as a PDF, for the same range the group
 * control is set to. Contributors are matched to the grid by name — the grid
 * keys rows by contributor, not by account.
 */
export function DownloadMemberContribution({
  budgetName,
  memberName,
  fromKey,
  toKey,
}: {
  budgetName: string;
  memberName: string;
  fromKey: string;
  toKey: string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [start, end] = ordered(fromKey, toKey);

  const download = async () => {
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
      {busy ? "Preparing…" : "Download PDF"}
    </button>
  );
}
