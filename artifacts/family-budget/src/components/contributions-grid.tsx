import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatKes } from "@/lib/utils";
import { ChevronDown, ChevronUp, Loader2, TableProperties } from "lucide-react";
import { useCollapsed } from "@/hooks/use-collapsed";
import {
  ContributorEditorFooter,
  EditableName,
  EditListButton,
  RemoveRowButton,
  useContributorEditor,
} from "@/components/contributor-editor";

type GridMonth = { month: number; year: number; label: string };
type GridRow = {
  contributorId: number;
  name: string;
  monthlyTarget: number | null;
  amounts: number[];
  total: number;
  outstanding: Array<number | null>;
  creditRemaining: number;
};
export type ContributionGrid = {
  months: GridMonth[];
  rows: GridRow[];
  columnTotals: number[];
  grandTotal: number;
};

const RANGES = [1, 3, 6, 12] as const;

/**
 * The sheet every collecting group already keeps: names down the side, months
 * across the top.
 *
 * Read-only, and deliberately so. Recording happens through its own screen
 * where the whole group is ticked at once, because a treasurer at a meeting is
 * filling one column, not hunting cells in a grid.
 */
export function ContributionsGrid({ canManage = false }: { canManage?: boolean }) {
  const [months, setMonths] = useState<number>(6);
  const [hideSettled, setHideSettled] = useState(false);
  const editor = useContributorEditor();
  const { open, toggle } = useCollapsed("who-has-paid");

  const { data, isLoading, isError } = useQuery<ContributionGrid>({
    queryKey: ["contribution-grid", months],
    queryFn: async () => {
      const response = await fetch(`/api/contributions/grid?months=${months}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load the contribution sheet.");
      return response.json() as Promise<ContributionGrid>;
    },
    retry: false,
  });

  const rows = data?.rows ?? [];
  const monthCount = data?.months.length ?? 0;
  const periodLabel =
    monthCount === 0
      ? ""
      : monthCount === 1
        ? data!.months[0].label
        : `${data!.months[0].label} – ${data!.months[monthCount - 1].label}`;
  // "Everyone except those who are up to date" is the list a treasurer chases,
  // and in a group of forty it is the only part worth reading.
  const shown = hideSettled
    ? rows.filter((row) => row.outstanding.some((amount) => (amount ?? 0) > 0))
    : rows;
  const behindCount = rows.filter((row) => row.outstanding.some((amount) => (amount ?? 0) > 0)).length;
  const summary =
    rows.length === 0
      ? "No contributors yet"
      : `${
          behindCount > 0 ? `${behindCount} of ${rows.length} behind` : "Everybody up to date"
        } · collected ${formatKes(data?.grandTotal ?? 0)}`;

  return (
    <Card className="overflow-hidden border-none shadow-md" data-testid="contributions-grid">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-start gap-2 text-left"
          >
            <TableProperties className="mt-1 h-5 w-5 shrink-0 text-secondary" aria-hidden="true" />
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-display text-lg font-bold text-foreground">
                Who has paid
                {open ? (
                  <span onClick={(event) => event.stopPropagation()}>
                    <EditListButton editor={editor} canManage={canManage} label="Add or remove people" />
                  </span>
                ) : null}
              </span>
              {open ? (
                <span className="mt-1 block text-sm text-muted-foreground">
                  {periodLabel ? (
                    <>
                      <span className="font-semibold text-foreground">{periodLabel}</span>
                      {monthCount > 1 ? ` · ${monthCount} months` : ""} — every member down the side, months across the top.
                    </>
                  ) : (
                    "Every member down the side, months across the top — the sheet you already keep."
                  )}
                </span>
              ) : (
                <span
                  className={`mt-1 block text-sm ${behindCount > 0 ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {summary}
                </span>
              )}
            </span>
            {open ? (
              <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : (
              <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
          </button>
          {open ? (
            <div className="flex shrink-0 gap-1">
              {RANGES.map((range) => (
                <Button
                  key={range}
                  variant={months === range ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMonths(range)}
                  data-testid={`grid-range-${range}`}
                >
                  {range}m
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        {open ? (
        <>

        {isLoading ? (
          <div className="flex min-h-32 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : isError || !data ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            This sheet could not be loaded. Nothing has been changed.
          </p>
        ) : rows.length === 0 ? (
          <>
            <p className="py-6 text-center text-sm text-muted-foreground">
              No contributors yet. Add people by name, or record a contribution, and they appear here.
            </p>
            <ContributorEditorFooter editor={editor} />
          </>
        ) : (
          <>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={hideSettled}
                onChange={(event) => setHideSettled(event.target.checked)}
                className="h-4 w-4 accent-primary"
                data-testid="toggle-hide-settled"
              />
              Show only those who still owe
            </label>

            <p className="text-xs leading-relaxed text-muted-foreground">
              Each figure is what a member <span className="font-semibold text-foreground">gave</span> that month; the expected
              amount is under their name. <span className="font-semibold text-destructive">Short</span> means less than
              expected; <span className="font-semibold text-success">Ahead</span> means an earlier over-payment already
              covered that month.
            </p>

            {/* Scrolls inside its own box: twelve months of columns must never
                push the whole page sideways on a phone. */}
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[34rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="sticky left-0 z-10 bg-card py-2 pr-3 text-left font-semibold text-muted-foreground">
                      Member
                    </th>
                    {data.months.map((entry) => (
                      <th
                        key={`${entry.year}-${entry.month}`}
                        className="whitespace-nowrap px-3 py-2 text-right font-semibold text-muted-foreground"
                      >
                        {entry.label}
                      </th>
                    ))}
                    <th className="whitespace-nowrap py-2 pl-3 text-right font-semibold text-muted-foreground">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <tr key={row.contributorId} className="border-b border-border/50">
                      <td className="sticky left-0 z-10 max-w-[10rem] bg-card py-2 pr-3 font-medium text-foreground">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <RemoveRowButton editor={editor} id={row.contributorId} name={row.name} />
                          <EditableName editor={editor} id={row.contributorId} name={row.name} />
                        </span>
                        <span className="block text-[11px] font-normal text-muted-foreground">
                          {row.monthlyTarget != null && row.monthlyTarget > 0
                            ? `Expected ${formatKes(row.monthlyTarget)}/mo`
                            : "No set amount"}
                        </span>
                        {/* Only when the row is otherwise clear — "ahead" beside
                            a "short" would say two opposite things at once. */}
                        {row.creditRemaining > 0 && row.outstanding.every((owed) => (owed ?? 0) === 0) ? (
                          <span className="block text-[11px] font-medium text-success">
                            {formatKes(row.creditRemaining)} ahead in total
                          </span>
                        ) : null}
                      </td>
                      {row.amounts.map((amount, column) => {
                        const owed = row.outstanding[column];
                        // Nothing paid this month, nothing owed, and there was
                        // an amount to meet: an earlier surplus has already
                        // covered it. Show it filled rather than blank, so a
                        // prepaid month does not read the same as an unpaid one.
                        const coveredAhead =
                          amount === 0 && (row.monthlyTarget ?? 0) > 0 && owed === 0;
                        return (
                          <td
                            key={column}
                            className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${
                              coveredAhead
                                ? "bg-success/10 text-success"
                                : amount === 0
                                  ? "text-muted-foreground/50"
                                  : "text-foreground"
                            }`}
                          >
                            {/* A dash, not KES 0: nothing recorded is not the
                                same as a payment of nothing. */}
                            {coveredAhead ? "Ahead" : amount === 0 ? "—" : formatKes(amount)}
                            {owed !== null && owed > 0 ? (
                              <span className="block text-[11px] font-medium text-destructive">
                                {formatKes(owed)} short
                              </span>
                            ) : null}
                          </td>
                        );
                      })}
                      <td className="whitespace-nowrap py-2 pl-3 text-right font-semibold tabular-nums text-foreground">
                        {formatKes(row.total)}
                      </td>
                    </tr>
                  ))}
                  {shown.length === 0 ? (
                    <tr>
                      <td colSpan={data.months.length + 2} className="py-6 text-center text-sm text-muted-foreground">
                        Everybody is up to date.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border">
                    <th className="sticky left-0 z-10 bg-card py-2 pr-3 text-left font-semibold text-foreground">
                      Collected
                    </th>
                    {data.columnTotals.map((total, column) => (
                      <td key={column} className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-foreground">
                        {formatKes(total)}
                      </td>
                    ))}
                    <td className="whitespace-nowrap py-2 pl-3 text-right font-semibold tabular-nums text-foreground">
                      {formatKes(data.grandTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <ContributorEditorFooter editor={editor} />
          </>
        )}
        </>
        ) : null}
      </CardContent>
    </Card>
  );
}
