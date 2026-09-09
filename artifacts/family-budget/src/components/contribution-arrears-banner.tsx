import { useQuery } from "@tanstack/react-query";
import { formatKes } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import type { ContributionGrid } from "@/components/contributions-grid";

/**
 * Who is behind for the current month — the treasurer's chase list, at the top
 * of the Contributions page.
 *
 * "Behind" is any shortfall against the monthly amount for the latest month in
 * the sheet, after an earlier surplus has been carried forward. Name-only
 * contributors are included; the whole point is the people who will not get an
 * app reminder. Renders nothing when everyone is settled.
 */
export function ContributionArrearsBanner() {
  const { data } = useQuery<ContributionGrid>({
    queryKey: ["contribution-grid", 12],
    queryFn: async () => {
      const response = await fetch("/api/contributions/grid?months=12", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load the contribution sheet.");
      return response.json() as Promise<ContributionGrid>;
    },
    retry: false,
  });

  if (!data || data.months.length === 0) return null;

  const lastIndex = data.months.length - 1;
  const monthLabel = data.months[lastIndex].label;
  const behind = data.rows
    .map((row) => ({ name: row.name, owed: row.outstanding[lastIndex] ?? 0 }))
    .filter((row) => row.owed > 0)
    .sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name));

  if (behind.length === 0) return null;

  const totalShort = behind.reduce((sum, row) => sum + row.owed, 0);

  return (
    <div
      className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
      data-testid="contribution-arrears-banner"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {behind.length} {behind.length === 1 ? "member is" : "members are"} behind for {monthLabel}
            {" — "}
            {formatKes(totalShort)} short in total
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {behind.map((row) => (
              <li key={row.name}>
                <span className="font-medium text-foreground">{row.name}</span> — {formatKes(row.owed)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
