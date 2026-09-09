import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { buildGroupContributionReportHtml } from "@/lib/contribution-report";
import type { ContributionGrid } from "@/components/contributions-grid";

type MonthOption = { key: string; label: string };

// The last 12 months, newest first — the window /api/contributions/grid can
// return in one call.
function monthOptions(): MonthOption[] {
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

/**
 * Downloads the group's month-by-month contribution sheet as a PDF, for the
 * chosen range. Opens a print-ready page the browser saves as PDF — no PDF
 * library, which keeps it working the same on a phone (Save to Files, then
 * share to WhatsApp) and on a desktop.
 */
export function DownloadContributions({ budgetName }: { budgetName: string }) {
  const { toast } = useToast();
  const options = useMemo(monthOptions, []);
  const [fromKey, setFromKey] = useState(options[Math.min(5, options.length - 1)].key);
  const [toKey, setToKey] = useState(options[0].key);
  const [busy, setBusy] = useState(false);

  const start = fromKey <= toKey ? fromKey : toKey;
  const end = fromKey <= toKey ? toKey : fromKey;

  const download = async () => {
    // Opened synchronously with the click so pop-up blockers allow it; filled
    // in once the data is ready.
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({
        variant: "destructive",
        title: "Allow pop-ups to download",
        description: "The report opens in a new tab to be saved as PDF.",
      });
      return;
    }
    printWindow.document.write("<!doctype html><title>Preparing…</title><body style=\"font:14px system-ui;margin:32px\">Preparing the report…");

    setBusy(true);
    try {
      const response = await fetch("/api/contributions/grid?months=12", { credentials: "include" });
      if (!response.ok) throw new Error("grid request failed");
      const grid = (await response.json()) as ContributionGrid;

      const keep = grid.months
        .map((entry, index) => ({
          index,
          key: `${entry.year}-${String(entry.month).padStart(2, "0")}`,
        }))
        .filter((entry) => entry.key >= start && entry.key <= end)
        .map((entry) => entry.index);

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

      const html = buildGroupContributionReportHtml({ budgetName, months, rows, grandTotal });
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
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
          onChange={(event) => setFromKey(event.target.value)}
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
          onChange={(event) => setToKey(event.target.value)}
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
