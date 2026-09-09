import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";

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
  const [sharing, setSharing] = useState(false);
  const [start, end] = ordered(fromKey, toKey);

  // The grid rows narrowed to the chosen range — shared by the PDF and the
  // WhatsApp text. Null when nothing falls in the range.
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
      const report = buildReport(await fetchGrid());
      if (!report) {
        chatWindow?.close();
        toast({ title: "Nothing in that range", description: "Pick a different from and to month." });
        return;
      }
      const url = `https://wa.me/?text=${encodeURIComponent(buildContributionWhatsAppText(report))}`;
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
      <div className="flex gap-2 sm:ml-auto">
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
